import { Injectable } from '@nestjs/common';
import type { CourseDraft, GenerationStage, KnowledgeBase } from '@edu/contracts';
import { IdSchema } from '@edu/contracts';
import { Prisma, type CourseGenerationJob } from '@edu/db';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service';

export type JobRow = CourseGenerationJob & { course: { id: string } | null };
/** Строка для списка: без тяжёлых JSON `draft`/`knowledge`. */
export type JobListRow = Omit<JobRow, 'draft' | 'knowledge'>;

export const JobCursorSchema = z.object({ createdAt: z.string().datetime(), id: IdSchema });
export type JobCursor = z.infer<typeof JobCursorSchema>;

/** Стадии, после которых задача не меняется фоновым процессом. */
export const TERMINAL_STAGES: readonly GenerationStage[] = [
  'READY',
  'ACCEPTED',
  'FAILED',
  'CANCELLED',
];
/** Стадии выполняющегося пайплайна (после старта runJob). */
export const RUNNING_STAGES: GenerationStage[] = [
  'EXTRACTING',
  'OUTLINING',
  'GENERATING',
  'ASSEMBLING',
];

type JobPatch = {
  stage?: GenerationStage;
  progress?: number;
  draft?: CourseDraft | null;
  knowledge?: KnowledgeBase | null;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

function toScalarData(patch: JobPatch): Prisma.CourseGenerationJobUpdateManyMutationInput {
  const data: Prisma.CourseGenerationJobUpdateManyMutationInput = {};
  if (patch.stage !== undefined) data.stage = patch.stage;
  if (patch.progress !== undefined) data.progress = patch.progress;
  if (patch.draft !== undefined)
    data.draft = patch.draft === null ? Prisma.JsonNull : (patch.draft as Prisma.InputJsonValue);
  if (patch.knowledge !== undefined)
    data.knowledge =
      patch.knowledge === null ? Prisma.JsonNull : (patch.knowledge as Prisma.InputJsonValue);
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
  if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
  return data;
}

const withCourse = { course: { select: { id: true } } } as const;

/** Таблица course_generation_jobs. Только этот модуль. */
@Injectable()
export class CourseBuilderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    teacherId: string;
    groupId: string;
    materialIds: string[];
    sourceKind: 'MATERIALS' | 'TOPIC';
    target: 'COURSE' | 'HOMEWORK';
    targetCourseId: string | null;
    studentIds: string[];
    dueAt: Date | null;
    topic: string | null;
    instructions: string | null;
    targetTitle: string | null;
  }): Promise<JobRow> {
    return this.prisma.courseGenerationJob.create({ data, include: withCourse });
  }

  async findById(id: string): Promise<JobRow | null> {
    return this.prisma.courseGenerationJob.findUnique({ where: { id }, include: withCourse });
  }

  async listByTeacher(
    teacherId: string,
    limit: number,
    cursor: JobCursor | null,
  ): Promise<JobListRow[]> {
    return this.prisma.courseGenerationJob.findMany({
      omit: { draft: true, knowledge: true },
      where: {
        teacherId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: withCourse,
    });
  }

  async update(
    id: string,
    patch: JobPatch & { courseId?: string | null; targetCourseId?: string | null },
  ): Promise<JobRow> {
    const { courseId, targetCourseId, ...scalar } = patch;
    const data: Prisma.CourseGenerationJobUpdateInput = toScalarData(scalar);
    if (courseId !== undefined)
      data.course = courseId ? { connect: { id: courseId } } : { disconnect: true };
    if (targetCourseId !== undefined) data.targetCourseId = targetCourseId;
    return this.prisma.courseGenerationJob.update({ where: { id }, data, include: withCourse });
  }

  /**
   * Условное обновление: только пока задача не в терминальной стадии. Атомарно закрывает гонки
   * отмены с фоновым пайплайном (CANCELLED не перезапишется на READY/FAILED и наоборот).
   * `false` — задача уже завершена (или удалена), ничего не записано.
   */
  async updateIfActive(id: string, patch: JobPatch): Promise<boolean> {
    const result = await this.prisma.courseGenerationJob.updateMany({
      where: { id, stage: { notIn: [...TERMINAL_STAGES] } },
      data: toScalarData(patch),
    });
    return result.count > 0;
  }

  /**
   * Зависшие задачи: пайплайн стартовал, но стадия не менялась дольше `staleBefore` (упал процесс
   * или worker). `includeQueued` — ещё и не начатые (inline-очередь не переживает рестарт).
   */
  async findStale(
    staleBefore: Date,
    includeQueued: boolean,
  ): Promise<Array<{ id: string; teacherId: string }>> {
    return this.prisma.courseGenerationJob.findMany({
      where: {
        stage: { in: includeQueued ? ['QUEUED', ...RUNNING_STAGES] : RUNNING_STAGES },
        updatedAt: { lt: staleBefore },
      },
      select: { id: true, teacherId: true },
      take: 100,
    });
  }

  async stageOf(id: string): Promise<GenerationStage | null> {
    const row = await this.prisma.courseGenerationJob.findUnique({
      where: { id },
      select: { stage: true },
    });
    return row?.stage ?? null;
  }
}
