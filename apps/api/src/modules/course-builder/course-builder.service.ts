import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  type CourseDraft,
  CourseDraftSchema,
  type CreateGenerationJobBody,
  type FileDto,
  type GenerationJobDto,
  type GenerationJobListItem,
  type GenerationSourceKind,
  type KnowledgeBase,
  type Paginated,
  type PaginationQuery,
} from '@edu/contracts';
import { Prisma } from '@edu/db';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppError, Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { decodeCursor, normalizeLimit, toPage } from '../../common/pagination/cursor';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { CoursesService } from '../courses/courses.service';
import { FilesService } from '../files/files.service';
import { GroupsService } from '../groups/groups.service';
import {
  type JobListRow,
  type JobRow,
  CourseBuilderRepository,
  JobCursorSchema,
  TERMINAL_STAGES,
} from './course-builder.repository';
import { CoursePipelineRunner, PipelineCancelledError } from './pipeline/runner';

export const GENERATE_JOB = 'generate';
const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_STAGES);
/** Задача без смены стадии/прогресса дольше этого считается мёртвой (упал процесс/worker). */
const STALE_AFTER_MS = 30 * 60 * 1000;
const STALE_SWEEP_EVERY_MS = 10 * 60 * 1000;
const FAILED_MESSAGE = 'Не удалось собрать черновик курса, попробуйте ещё раз';
const INTERRUPTED_MESSAGE = 'Генерация прервана: сервер перезапускался, запустите её заново';

/**
 * Задачи генерации курса (F8): создание, статус, черновик, принятие, отмена; выполнение
 * пайплайна в фоновой задаче очереди `course-builder`.
 */
@Injectable()
export class CourseBuilderService implements OnModuleInit, OnModuleDestroy {
  private readonly log;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: CourseBuilderRepository,
    private readonly pipeline: CoursePipelineRunner,
    private readonly files: FilesService,
    private readonly groups: GroupsService,
    private readonly courses: CoursesService,
    private readonly events: DomainEventBus,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'course-builder' });
  }

  onModuleInit(): void {
    // Сторож зависших задач: при старте и периодически. Порог по updatedAt с запасом —
    // живой пайплайн обновляет прогресс после каждого окна/урока.
    void this.failStaleJobs();
    this.sweepTimer = setInterval(() => void this.failStaleJobs(), STALE_SWEEP_EVERY_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /** Переводит зависшие задачи в FAILED (с событием). Ошибки только логируются. */
  async failStaleJobs(now: Date = new Date()): Promise<number> {
    try {
      // inline-очередь не переживает рестарт: давно не начатая задача уже не начнётся
      const stale = await this.repo.findStale(
        new Date(now.getTime() - STALE_AFTER_MS),
        this.queue.driver === 'inline',
      );
      let failed = 0;
      for (const job of stale) {
        const applied = await this.repo.updateIfActive(job.id, {
          stage: 'FAILED',
          error: INTERRUPTED_MESSAGE,
          finishedAt: now,
        });
        if (!applied) continue;
        failed += 1;
        await this.events.emit('generation.finished', {
          jobId: job.id,
          teacherId: job.teacherId,
          stage: 'FAILED',
          at: now.toISOString(),
        });
      }
      if (failed > 0) this.log.warn({ failed }, 'зависшие задачи генерации переведены в FAILED');
      return failed;
    } catch (error) {
      this.log.error({ err: error }, 'сторож задач генерации: ошибка');
      return 0;
    }
  }

  // ---------- ручки ----------

  async create(user: AuthUser, body: CreateGenerationJobBody): Promise<GenerationJobDto> {
    const teacherId = this.requireTeacher(user);
    await this.groups.assertTeacherOwnsGroup(teacherId, body.groupId);
    const materialIds = body.materialIds ?? [];
    if (materialIds.length > 0) await this.files.listOwnedMaterials(user.userId, materialIds);
    const sourceKind: GenerationSourceKind = materialIds.length > 0 ? 'MATERIALS' : 'TOPIC';
    const row = await this.repo.create({
      teacherId,
      groupId: body.groupId,
      materialIds,
      sourceKind,
      topic: body.topic ?? null,
      instructions: body.instructions ?? null,
      targetTitle: body.targetTitle ?? null,
    });
    await this.queue.enqueue(
      'course-builder',
      GENERATE_JOB,
      { jobId: row.id, userId: user.userId },
      { jobId: row.id, attempts: 1 },
    );
    this.log.info(
      { jobId: row.id, sourceKind, materials: materialIds.length },
      'задача поставлена',
    );
    return this.toDto(row);
  }

  async list(user: AuthUser, query: PaginationQuery): Promise<Paginated<GenerationJobListItem>> {
    const teacherId = this.requireTeacher(user);
    const limit = normalizeLimit(query.limit);
    const rows = await this.repo.listByTeacher(
      teacherId,
      limit,
      decodeCursor(query.cursor, JobCursorSchema),
    );
    const page = toPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    // Файлы всей страницы — одним запросом, а не по запросу на задачу
    const filesById = await this.filesById(page.items.flatMap((row) => row.materialIds));
    const items = page.items.map((row) => this.toListItem(row, filesById));
    return { items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
  }

  async get(user: AuthUser, jobId: string): Promise<GenerationJobDto> {
    return this.toDto(await this.requireOwned(user, jobId));
  }

  async updateDraft(user: AuthUser, jobId: string, draft: CourseDraft): Promise<GenerationJobDto> {
    const row = await this.requireOwned(user, jobId);
    if (row.stage !== 'READY')
      throw Errors.businessRule('Черновик можно править только до принятия');
    return this.toDto(await this.repo.update(row.id, { draft }));
  }

  async accept(user: AuthUser, jobId: string): Promise<{ courseId: string }> {
    const row = await this.requireOwned(user, jobId);
    // Курс уже создан (в т.ч. прошлый accept упал после создания) — довести стадию и вернуть его
    if (row.course) return this.finishAccept(row, row.course.id);
    if (row.stage !== 'READY') throw Errors.businessRule('Черновик ещё не готов');
    const draft = CourseDraftSchema.safeParse(row.draft);
    if (!draft.success) throw Errors.internal('Черновик задачи повреждён');
    let courseId: string;
    try {
      ({ courseId } = await this.courses.createFromDraft({
        teacherId: row.teacherId,
        groupId: row.groupId,
        draft: draft.data,
        generationJobId: row.id,
      }));
    } catch (error) {
      // Параллельный accept успел создать курс (Course.generationJobId уникален) — идемпотентно
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await this.repo.findById(row.id);
        if (again?.course) return this.finishAccept(again, again.course.id);
      }
      throw error;
    }
    this.log.info({ jobId: row.id, courseId }, 'черновик принят');
    return this.finishAccept(row, courseId);
  }

  async cancel(user: AuthUser, jobId: string): Promise<GenerationJobDto> {
    const row = await this.requireOwned(user, jobId);
    // Условно: фоновый пайплайн мог завершить задачу между чтением и записью
    const applied = await this.repo.updateIfActive(row.id, {
      stage: 'CANCELLED',
      finishedAt: new Date(),
    });
    if (!applied) throw Errors.businessRule('Задача уже завершена');
    return this.toDto((await this.repo.findById(row.id)) ?? row);
  }

  // ---------- фоновая задача ----------

  async runJob(jobId: string, userId: string): Promise<void> {
    const row = await this.repo.findById(jobId);
    if (!row) return;
    if (TERMINAL.has(row.stage)) return;
    try {
      const started = await this.repo.updateIfActive(row.id, {
        stage: 'EXTRACTING',
        progress: 2,
        startedAt: new Date(),
        error: null,
      });
      if (!started) return;
      const result = await this.pipeline.run(
        {
          id: row.id,
          userId,
          sourceKind: row.sourceKind === 'TOPIC' ? 'TOPIC' : 'MATERIALS',
          topic: row.topic,
          materialIds: row.materialIds,
          instructions: row.instructions,
          targetTitle: row.targetTitle,
        },
        async (progress) => {
          // Условная запись: поздний отчёт воркера не воскрешает FAILED/CANCELLED
          await this.repo.updateIfActive(row.id, {
            stage: progress.stage,
            progress: progress.progress,
            ...(progress.knowledge ? { knowledge: progress.knowledge } : {}),
          });
        },
        async () => (await this.repo.stageOf(row.id)) === 'CANCELLED',
      );
      const ready = await this.repo.updateIfActive(row.id, {
        stage: 'READY',
        progress: 100,
        draft: result.draft,
        knowledge: result.knowledge,
        finishedAt: new Date(),
      });
      if (!ready) return;
      await this.events.emit('generation.finished', {
        jobId: row.id,
        teacherId: row.teacherId,
        stage: 'READY',
        at: new Date().toISOString(),
      });
      this.log.info({ jobId: row.id, modules: result.draft.modules.length }, 'черновик готов');
    } catch (error) {
      if (error instanceof PipelineCancelledError) return;
      this.log.error({ jobId: row.id, err: error }, 'генерация не удалась');
      // Преподавателю — только прикладные сообщения; технические (Zod, провайдер) — в лог
      const message =
        error instanceof AppError && error.code !== 'INTERNAL' ? error.message : FAILED_MESSAGE;
      // Отменённая задача остаётся CANCELLED: AbortError и пр. после отмены не дают FAILED
      const applied = await this.repo.updateIfActive(row.id, {
        stage: 'FAILED',
        error: message,
        finishedAt: new Date(),
      });
      if (!applied) return;
      await this.events.emit('generation.finished', {
        jobId: row.id,
        teacherId: row.teacherId,
        stage: 'FAILED',
        at: new Date().toISOString(),
      });
    }
  }

  // ---------- внутреннее ----------

  private requireTeacher(user: AuthUser): string {
    if (user.activeRole !== 'TEACHER' || !user.profileId)
      throw Errors.forbidden('Только для преподавателя');
    return user.profileId;
  }

  private async requireOwned(user: AuthUser, jobId: string): Promise<JobRow> {
    const teacherId = this.requireTeacher(user);
    const row = await this.repo.findById(jobId);
    if (!row || row.teacherId !== teacherId) throw Errors.notFound('Задача генерации');
    return row;
  }

  private async finishAccept(row: JobRow, courseId: string): Promise<{ courseId: string }> {
    if (row.stage !== 'ACCEPTED')
      await this.repo.update(row.id, { stage: 'ACCEPTED', finishedAt: new Date() });
    return { courseId };
  }

  private async filesById(fileIds: string[]): Promise<Map<string, FileDto>> {
    const unique = [...new Set(fileIds)];
    if (unique.length === 0) return new Map();
    return new Map((await this.files.listDtosByIds(unique)).map((f) => [f.id, f]));
  }

  private toListItem(row: JobListRow, filesById: Map<string, FileDto>): GenerationJobListItem {
    return {
      id: row.id,
      teacherId: row.teacherId,
      groupId: row.groupId,
      courseId: row.course?.id ?? null,
      materials: row.materialIds.map((id) => filesById.get(id)).filter((f): f is FileDto => !!f),
      instructions: row.instructions,
      targetTitle: row.targetTitle,
      sourceKind: row.sourceKind === 'TOPIC' ? 'TOPIC' : 'MATERIALS',
      topic: row.topic,
      stage: row.stage,
      progress: Math.max(0, Math.min(100, row.progress)),
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }

  private async toDto(row: JobRow): Promise<GenerationJobDto> {
    return {
      ...this.toListItem(row, await this.filesById(row.materialIds)),
      knowledge: (row.knowledge as KnowledgeBase | null) ?? null,
      draft: (row.draft as CourseDraft | null) ?? null,
    };
  }
}
