import { Injectable } from '@nestjs/common';
import type { CourseDraft } from '@edu/contracts';
import type { Prisma } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Публичный сервис модуля courses (docs/08 §8.3). Здесь — только то, что нужно course-builder:
 * создать курс (DRAFT) из черновика генерации. Полный модуль — workstream B.
 */
@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromDraft(input: {
    teacherId: string;
    groupId: string;
    draft: CourseDraft;
    generationJobId: string | null;
  }): Promise<{ courseId: string }> {
    const { draft } = input;
    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          teacherId: input.teacherId,
          groupId: input.groupId,
          title: draft.title,
          description: draft.description ?? null,
          status: 'DRAFT',
          generationJobId: input.generationJobId,
        },
        select: { id: true },
      });
      for (const [moduleOrder, module] of draft.modules.entries()) {
        const createdModule = await tx.courseModule.create({
          data: {
            courseId: created.id,
            order: moduleOrder,
            title: module.title,
            summary: module.summary ?? null,
          },
          select: { id: true },
        });
        if (module.blocks.length === 0) continue;
        await tx.courseBlock.createMany({
          data: module.blocks.map((block, order) => ({
            moduleId: createdModule.id,
            order,
            type: block.type,
            title: block.title,
            content: block.content as Prisma.InputJsonValue,
            estimatedMinutes: block.estimatedMinutes ?? null,
            isRequired: block.isRequired ?? true,
          })),
        });
      }
      return created;
    });
    return { courseId: course.id };
  }

  /** Курсы ученика с прогрессом — для контекста ИИ. */
  async listStudentCourseProgress(
    studentId: string,
  ): Promise<Array<{ courseId: string; title: string; percent: number; nextBlockTitle?: string }>> {
    const rows = await this.prisma.courseProgress.findMany({
      where: { studentId },
      include: { course: { select: { id: true, title: true, status: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    return rows
      .filter((r) => r.course.status === 'PUBLISHED')
      .map((r) => ({ courseId: r.course.id, title: r.course.title, percent: r.percent }));
  }
}
