import { Injectable } from '@nestjs/common';
import type { AssignmentType, BlockAnswers, SubmissionStatus } from '@edu/contracts';
import { IdSchema } from '@edu/contracts';
import { Prisma, type Assignment, type Submission } from '@edu/db';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service';

export type AssignmentRow = Assignment;
export type SubmissionRowModel = Submission;

export const AssignmentCursorSchema = z.object({ createdAt: z.string().datetime(), id: IdSchema });
export type AssignmentCursor = z.infer<typeof AssignmentCursorSchema>;

export interface CreateAssignmentData {
  groupId: string;
  teacherId: string;
  courseId: string | null;
  blockId: string | null;
  studentIds: string[];
  title: string;
  description: string | null;
  type: AssignmentType;
  dueAt: Date | null;
  maxScore: number;
  allowedAttempts: number | null;
  publishedAt: Date | null;
}

/**
 * Видимость задания для ученика: опубликовано, не удалено и адресовано либо всей группе
 * (пустой `studentIds`), либо лично ему.
 */
export function visibleToStudent(studentId: string): Prisma.AssignmentWhereInput {
  return {
    deletedAt: null,
    publishedAt: { not: null },
    OR: [{ studentIds: { isEmpty: true } }, { studentIds: { has: studentId } }],
  };
}

/** Таблицы assignments/submissions/submission_attempts. Только этот модуль (AGENT_GUIDE §4). */
@Injectable()
export class AssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateAssignmentData): Promise<AssignmentRow> {
    return this.prisma.assignment.create({ data });
  }

  /** Пакетное создание при публикации курса; возвращает созданные строки. */
  async createMany(rows: CreateAssignmentData[]): Promise<AssignmentRow[]> {
    if (rows.length === 0) return [];
    return this.prisma.$transaction(rows.map((data) => this.prisma.assignment.create({ data })));
  }

  findById(id: string): Promise<AssignmentRow | null> {
    return this.prisma.assignment.findFirst({ where: { id, deletedAt: null } });
  }

  /** Какие из блоков уже стали заданиями: публикация курса идемпотентна по `blockId`. */
  async findBlockIdsWithAssignment(blockIds: string[]): Promise<Set<string>> {
    if (blockIds.length === 0) return new Set();
    const rows = await this.prisma.assignment.findMany({
      where: { blockId: { in: blockIds }, deletedAt: null },
      select: { blockId: true },
    });
    return new Set(rows.flatMap((row) => (row.blockId ? [row.blockId] : [])));
  }

  listByTeacher(
    teacherId: string,
    filter: { groupId?: string; dueBefore?: Date; dueFromOrNull?: boolean },
    limit: number,
    cursor: AssignmentCursor | null,
  ): Promise<AssignmentRow[]> {
    const now = new Date();
    const status: Prisma.AssignmentWhereInput =
      filter.dueBefore !== undefined
        ? { dueAt: { lt: filter.dueBefore } }
        : filter.dueFromOrNull
          ? { OR: [{ dueAt: null }, { dueAt: { gte: now } }] }
          : {};
    return this.prisma.assignment.findMany({
      where: {
        teacherId,
        deletedAt: null,
        ...(filter.groupId ? { groupId: filter.groupId } : {}),
        ...status,
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
    });
  }

  listForStudent(studentId: string, groupIds: string[]): Promise<AssignmentRow[]> {
    if (groupIds.length === 0) return Promise.resolve([]);
    return this.prisma.assignment.findMany({
      where: { groupId: { in: groupIds }, ...visibleToStudent(studentId) },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findForStudent(
    studentId: string,
    groupIds: string[],
    assignmentId: string,
  ): Promise<AssignmentRow | null> {
    return this.prisma.assignment.findFirst({
      where: { id: assignmentId, groupId: { in: groupIds }, ...visibleToStudent(studentId) },
    });
  }

  /** Задание блока курса, если оно адресовано ученику (доступ к самому курсу проверяет courses). */
  findForStudentByBlock(studentId: string, blockId: string): Promise<AssignmentRow | null> {
    return this.prisma.assignment.findFirst({
      where: { blockId, ...visibleToStudent(studentId) },
    });
  }

  update(id: string, data: Prisma.AssignmentUpdateInput): Promise<AssignmentRow> {
    return this.prisma.assignment.update({ where: { id }, data });
  }

  /** Мягкое удаление: сдачи остаются, задание исчезает из списков (контракт `DELETE`). */
  async softDelete(id: string): Promise<void> {
    await this.prisma.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ---------- сдачи ----------

  listSubmissionsOfAssignment(assignmentId: string): Promise<SubmissionRowModel[]> {
    return this.prisma.submission.findMany({ where: { assignmentId } });
  }

  async countsByAssignment(
    assignmentIds: string[],
  ): Promise<Map<string, { submitted: number; graded: number }>> {
    const counts = new Map<string, { submitted: number; graded: number }>();
    if (assignmentIds.length === 0) return counts;
    const rows = await this.prisma.submission.groupBy({
      by: ['assignmentId', 'status'],
      where: { assignmentId: { in: assignmentIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      const entry = counts.get(row.assignmentId) ?? { submitted: 0, graded: 0 };
      // «Сдано» — всё, что ученик отправил: и ожидающее проверки, и уже проверенное.
      if (row.status === 'SUBMITTED' || row.status === 'GRADED') entry.submitted += row._count._all;
      if (row.status === 'GRADED') entry.graded += row._count._all;
      counts.set(row.assignmentId, entry);
    }
    return counts;
  }

  /** Задания группы, у которых срок уже прошёл (знаменатель «выполнения заданий»). */
  listDueOfGroup(groupId: string, before: Date): Promise<AssignmentRow[]> {
    return this.prisma.assignment.findMany({
      where: {
        groupId,
        deletedAt: null,
        publishedAt: { not: null },
        dueAt: { not: null, lte: before },
      },
    });
  }

  /** Все опубликованные задания группы. */
  listPublishedOfGroup(groupId: string): Promise<AssignmentRow[]> {
    return this.prisma.assignment.findMany({
      where: { groupId, deletedAt: null, publishedAt: { not: null } },
    });
  }

  listSubmissionsOfAssignments(assignmentIds: string[]): Promise<SubmissionRowModel[]> {
    if (assignmentIds.length === 0) return Promise.resolve([]);
    return this.prisma.submission.findMany({ where: { assignmentId: { in: assignmentIds } } });
  }

  listSubmissionsOfStudent(
    studentId: string,
    assignmentIds: string[],
  ): Promise<SubmissionRowModel[]> {
    if (assignmentIds.length === 0) return Promise.resolve([]);
    return this.prisma.submission.findMany({
      where: { studentId, assignmentId: { in: assignmentIds } },
    });
  }

  findSubmission(assignmentId: string, studentId: string): Promise<SubmissionRowModel | null> {
    return this.prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
    });
  }

  findSubmissionById(id: string): Promise<SubmissionRowModel | null> {
    return this.prisma.submission.findUnique({ where: { id } });
  }

  listAttempts(
    submissionId: string,
  ): Promise<Array<{ n: number; score: number | null; submittedAt: Date }>> {
    return this.prisma.submissionAttempt.findMany({
      where: { submissionId },
      select: { n: true, score: true, submittedAt: true },
      orderBy: { n: 'asc' },
    });
  }

  /**
   * Новая попытка сдачи одной транзакцией: строка сдачи (создаётся при первой) + снимок попытки.
   * Оценка прошлой проверки сбрасывается — она относилась к предыдущей попытке.
   */
  async submit(input: {
    assignmentId: string;
    studentId: string;
    answers: BlockAnswers | null;
    text: string | null;
    fileIds: string[];
    isLate: boolean;
    submittedAt: Date;
  }): Promise<SubmissionRowModel> {
    const answers = (input.answers ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findUnique({
        where: {
          assignmentId_studentId: {
            assignmentId: input.assignmentId,
            studentId: input.studentId,
          },
        },
        select: { id: true, attemptsCount: true },
      });
      const attempt = (existing?.attemptsCount ?? 0) + 1;
      const data = {
        status: 'SUBMITTED' as SubmissionStatus,
        attemptsCount: attempt,
        score: null,
        gradedAt: null,
        gradedById: null,
        feedback: null,
        answers,
        text: input.text,
        fileIds: input.fileIds,
        submittedAt: input.submittedAt,
        isLate: input.isLate,
      };
      const submission = existing
        ? await tx.submission.update({ where: { id: existing.id }, data })
        : await tx.submission.create({
            data: { assignmentId: input.assignmentId, studentId: input.studentId, ...data },
          });
      await tx.submissionAttempt.create({
        data: {
          submissionId: submission.id,
          n: attempt,
          answers,
          submittedAt: input.submittedAt,
        },
      });
      return submission;
    });
  }

  async grade(
    submissionId: string,
    data: {
      status: SubmissionStatus;
      score: number;
      feedback: string | null;
      gradedById: string;
      gradedAt: Date;
    },
  ): Promise<SubmissionRowModel> {
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.submission.update({ where: { id: submissionId }, data });
      // Балл пишется только на ту попытку, которую проверяли: история прошлых оценок остаётся.
      await tx.submissionAttempt.updateMany({
        where: { submissionId, n: submission.attemptsCount },
        data: { score: data.score },
      });
      return submission;
    });
  }
}
