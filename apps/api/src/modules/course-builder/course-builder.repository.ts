import { Injectable } from '@nestjs/common';
import type { CourseDraft, GenerationStage, KnowledgeBase } from '@edu/contracts';
import { Prisma, type CourseGenerationJob } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type JobRow = CourseGenerationJob & { course: { id: string } | null };

export type JobCursor = { createdAt: string; id: string };

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
  ): Promise<JobRow[]> {
    return this.prisma.courseGenerationJob.findMany({
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
    patch: {
      stage?: GenerationStage;
      progress?: number;
      draft?: CourseDraft | null;
      knowledge?: KnowledgeBase | null;
      error?: string | null;
      courseId?: string | null;
      startedAt?: Date | null;
      finishedAt?: Date | null;
    },
  ): Promise<JobRow> {
    const data: Prisma.CourseGenerationJobUpdateInput = {};
    if (patch.stage !== undefined) data.stage = patch.stage;
    if (patch.progress !== undefined) data.progress = patch.progress;
    if (patch.draft !== undefined)
      data.draft = patch.draft === null ? Prisma.JsonNull : (patch.draft as Prisma.InputJsonValue);
    if (patch.knowledge !== undefined)
      data.knowledge =
        patch.knowledge === null ? Prisma.JsonNull : (patch.knowledge as Prisma.InputJsonValue);
    if (patch.error !== undefined) data.error = patch.error;
    if (patch.courseId !== undefined)
      data.course = patch.courseId ? { connect: { id: patch.courseId } } : { disconnect: true };
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
    return this.prisma.courseGenerationJob.update({ where: { id }, data, include: withCourse });
  }

  async stageOf(id: string): Promise<GenerationStage | null> {
    const row = await this.prisma.courseGenerationJob.findUnique({
      where: { id },
      select: { stage: true },
    });
    return row?.stage ?? null;
  }
}
