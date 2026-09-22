import { Inject, Injectable } from '@nestjs/common';
import {
  type CourseDraft,
  CourseDraftSchema,
  type CreateGenerationJobBody,
  type GenerationJobDto,
  type GenerationJobListItem,
  type GenerationSourceKind,
  type KnowledgeBase,
  type Paginated,
  type PaginationQuery,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { decodeCursor, normalizeLimit, toPage } from '../../common/pagination/cursor';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { CoursesService } from '../courses/courses.service';
import { FilesService } from '../files/files.service';
import { GroupsService } from '../groups/groups.service';
import { type JobCursor, type JobRow, CourseBuilderRepository } from './course-builder.repository';
import { CoursePipelineRunner, PipelineCancelledError } from './pipeline/runner';

export const GENERATE_JOB = 'generate';
const TERMINAL: ReadonlySet<string> = new Set(['READY', 'ACCEPTED', 'FAILED', 'CANCELLED']);

/**
 * Задачи генерации курса (F8): создание, статус, черновик, принятие, отмена; выполнение
 * пайплайна в фоновой задаче очереди `course-builder`.
 */
@Injectable()
export class CourseBuilderService {
  private readonly log;

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
      decodeCursor<JobCursor>(query.cursor),
    );
    const page = toPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    const items = await Promise.all(
      page.items.map(async (row) => {
        const { draft: _draft, knowledge: _knowledge, ...item } = await this.toDto(row);
        return item;
      }),
    );
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
    if (row.stage === 'ACCEPTED' && row.course) return { courseId: row.course.id };
    if (row.stage !== 'READY') throw Errors.businessRule('Черновик ещё не готов');
    const draft = CourseDraftSchema.safeParse(row.draft);
    if (!draft.success) throw Errors.internal('Черновик задачи повреждён');
    const { courseId } = await this.courses.createFromDraft({
      teacherId: row.teacherId,
      groupId: row.groupId,
      draft: draft.data,
      generationJobId: row.id,
    });
    await this.repo.update(row.id, { stage: 'ACCEPTED', courseId, finishedAt: new Date() });
    this.log.info({ jobId: row.id, courseId }, 'черновик принят');
    return { courseId };
  }

  async cancel(user: AuthUser, jobId: string): Promise<GenerationJobDto> {
    const row = await this.requireOwned(user, jobId);
    if (TERMINAL.has(row.stage)) throw Errors.businessRule('Задача уже завершена');
    return this.toDto(
      await this.repo.update(row.id, { stage: 'CANCELLED', finishedAt: new Date() }),
    );
  }

  // ---------- фоновая задача ----------

  async runJob(jobId: string, userId: string): Promise<void> {
    const row = await this.repo.findById(jobId);
    if (!row) return;
    if (TERMINAL.has(row.stage)) return;
    await this.repo.update(row.id, {
      stage: 'EXTRACTING',
      progress: 2,
      startedAt: new Date(),
      error: null,
    });
    try {
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
          // Поздний отчёт параллельного воркера не должен воскрешать FAILED/CANCELLED
          if (TERMINAL.has((await this.repo.stageOf(row.id)) ?? '')) return;
          await this.repo.update(row.id, {
            stage: progress.stage,
            progress: progress.progress,
            ...(progress.knowledge ? { knowledge: progress.knowledge } : {}),
          });
        },
        async () => (await this.repo.stageOf(row.id)) === 'CANCELLED',
      );
      if (TERMINAL.has((await this.repo.stageOf(row.id)) ?? '')) return;
      await this.repo.update(row.id, {
        stage: 'READY',
        progress: 100,
        draft: result.draft,
        knowledge: result.knowledge,
        finishedAt: new Date(),
      });
      await this.events.emit('generation.finished', {
        jobId: row.id,
        teacherId: row.teacherId,
        stage: 'READY',
        at: new Date().toISOString(),
      });
      this.log.info({ jobId: row.id, modules: result.draft.modules.length }, 'черновик готов');
    } catch (error) {
      if (error instanceof PipelineCancelledError) return;
      const message = error instanceof Error ? error.message : String(error);
      this.log.error({ jobId: row.id, err: error }, 'генерация не удалась');
      await this.repo.update(row.id, { stage: 'FAILED', error: message, finishedAt: new Date() });
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

  private async toDto(row: JobRow): Promise<GenerationJobDto> {
    return {
      id: row.id,
      teacherId: row.teacherId,
      groupId: row.groupId,
      courseId: row.course?.id ?? null,
      materials: await this.files.listDtosByIds(row.materialIds),
      instructions: row.instructions,
      targetTitle: row.targetTitle,
      sourceKind: row.sourceKind === 'TOPIC' ? 'TOPIC' : 'MATERIALS',
      topic: row.topic,
      knowledge: (row.knowledge as KnowledgeBase | null) ?? null,
      stage: row.stage,
      progress: Math.max(0, Math.min(100, row.progress)),
      draft: (row.draft as CourseDraft | null) ?? null,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}
