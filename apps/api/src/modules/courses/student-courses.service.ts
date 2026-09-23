import { Injectable } from '@nestjs/common';
import {
  type BlockAnswers,
  type CompleteBlockBody,
  type CompleteBlockResult,
  type CourseBlock,
  type CourseProgressBrief,
  type OpenBlockResult,
  type StudentBlockDetail,
  type StudentCourseDetail,
  type StudentCoursesList,
  toStudentBlock,
} from '@edu/contracts';
import type { Prisma } from '@edu/db';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { GroupsService } from '../groups/groups.service';

/** Строка блока из БД в блок контракта: `content` в схеме — Json. */
type BlockRow = {
  id: string;
  moduleId: string;
  order: number;
  type: CourseBlock['type'];
  title: string;
  content: Prisma.JsonValue;
  estimatedMinutes: number | null;
  isRequired: boolean;
};

const toBlock = (row: BlockRow): CourseBlock =>
  ({
    id: row.id,
    moduleId: row.moduleId,
    order: row.order,
    type: row.type,
    title: row.title,
    content: row.content,
    estimatedMinutes: row.estimatedMinutes,
    isRequired: row.isRequired,
  }) as CourseBlock;

const percentOf = (completed: number, total: number) =>
  total === 0 ? 0 : Math.round((completed / total) * 100);

/**
 * Балл QUIZ в процентах: вопрос засчитан, если выбранные варианты совпали с правильными
 * как множества. Для остальных типов автопроверки нет — null (проверяет преподаватель).
 * Ответов не прислали — 0: пустая попытка не может быть зачтена как верная.
 */
export function quizScore(block: CourseBlock, answers: BlockAnswers | undefined): number | null {
  if (block.type !== 'QUIZ') return null;
  const { questions } = block.content;
  if (questions.length === 0) return 0;
  const chosen = (answers ?? {}) as Record<string, unknown>;
  const correct = questions.filter((question) => {
    const picked = chosen[question.id];
    if (!Array.isArray(picked)) return false;
    const set = new Set(picked as string[]);
    return (
      set.size === question.correctOptionIds.length &&
      question.correctOptionIds.every((id) => set.has(id))
    );
  }).length;
  return percentOf(correct, questions.length);
}

/**
 * Курсы и блоки глазами ученика (docs/07 F3): список курсов групп, структура курса с прогрессом,
 * блок без правильных ответов, отметки «открыл» и «прошёл» с автопроверкой QUIZ.
 * Черновик курса для ученика не существует (404), курс чужой группы — 403.
 */
@Injectable()
export class StudentCoursesService {
  private readonly log;

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly assignments: AssignmentsService,
    private readonly events: DomainEventBus,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'courses' });
  }

  async listCourses(user: AuthUser): Promise<StudentCoursesList> {
    const studentId = requireStudent(user);
    const groupIds = await this.groups.listGroupIdsOfStudent(studentId);
    if (groupIds.length === 0) return { items: [] };
    const rows = await this.prisma.course.findMany({
      where: { groupId: { in: groupIds }, status: 'PUBLISHED', deletedAt: null },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: { blocks: { orderBy: { order: 'asc' }, select: { id: true, title: true, type: true } } },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
    const [groupsById, statuses] = await Promise.all([
      this.groups.groupBriefsByIds(rows.map((row) => row.groupId)),
      this.blockStatuses(
        studentId,
        rows.flatMap((row) => row.modules.flatMap((module) => module.blocks.map((b) => b.id))),
      ),
    ]);
    return {
      items: rows.flatMap((row) => {
        const group = groupsById.get(row.groupId);
        if (!group) return [];
        const blocks = row.modules.flatMap((module) => module.blocks);
        const completed = blocks.filter((block) => statuses.get(block.id) === 'COMPLETED');
        const next = blocks.find((block) => statuses.get(block.id) !== 'COMPLETED');
        return [
          {
            id: row.id,
            title: row.title,
            group,
            progress: {
              percent: percentOf(completed.length, blocks.length),
              completedBlocks: completed.length,
              totalBlocks: blocks.length,
            },
            nextBlock: next ? { id: next.id, title: next.title, type: next.type } : null,
          },
        ];
      }),
    };
  }

  async getCourse(user: AuthUser, courseId: string): Promise<StudentCourseDetail> {
    const studentId = requireStudent(user);
    const course = await this.requireVisibleCourse(studentId, courseId);
    const groupsById = await this.groups.groupBriefsByIds([course.groupId]);
    const group = groupsById.get(course.groupId);
    if (!group) throw Errors.internal('Группа курса не найдена');
    const statuses = await this.blockStatuses(
      studentId,
      course.modules.flatMap((module) => module.blocks.map((block) => block.id)),
    );
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      group,
      modules: course.modules.map((module) => ({
        id: module.id,
        title: module.title,
        order: module.order,
        blocks: module.blocks.map((block) => ({
          id: block.id,
          title: block.title,
          type: block.type,
          order: block.order,
          estimatedMinutes: block.estimatedMinutes,
          isRequired: block.isRequired,
          progress: statuses.get(block.id) ?? null,
        })),
      })),
    };
  }

  async getBlock(user: AuthUser, blockId: string): Promise<StudentBlockDetail> {
    const studentId = requireStudent(user);
    const { block, courseId } = await this.requireVisibleBlock(studentId, blockId);
    const [assignment, progress] = await Promise.all([
      this.assignments.briefOfBlockForStudent(studentId, block.id),
      this.prisma.blockProgress.findUnique({
        where: { studentId_blockId: { studentId, blockId: block.id } },
      }),
    ]);
    return {
      ...toStudentBlock(toBlock(block)),
      courseId,
      assignment,
      progress: progress
        ? { status: progress.status, attempts: progress.attempts, score: progress.score }
        : null,
    };
  }

  async openBlock(user: AuthUser, blockId: string): Promise<OpenBlockResult> {
    const studentId = requireStudent(user);
    const { block, courseId } = await this.requireVisibleBlock(studentId, blockId);
    const progress = await this.prisma.blockProgress.upsert({
      where: { studentId_blockId: { studentId, blockId: block.id } },
      // Повторный заход не сбрасывает пройденный блок и не меняет попытки.
      create: { studentId, blockId: block.id, status: 'OPENED' },
      update: {},
    });
    await this.events.emit('block.opened', {
      studentId,
      blockId: block.id,
      courseId,
      at: new Date().toISOString(),
    });
    return {
      progress: { status: progress.status, attempts: progress.attempts, score: progress.score },
    };
  }

  async completeBlock(
    user: AuthUser,
    blockId: string,
    body: CompleteBlockBody,
  ): Promise<CompleteBlockResult> {
    const studentId = requireStudent(user);
    const { block, courseId } = await this.requireVisibleBlock(studentId, blockId);
    const score = quizScore(toBlock(block), body.answers);
    const completedAt = new Date();
    const progress = await this.prisma.blockProgress.upsert({
      where: { studentId_blockId: { studentId, blockId: block.id } },
      create: {
        studentId,
        blockId: block.id,
        status: 'COMPLETED',
        completedAt,
        attempts: 1,
        score,
      },
      update: {
        status: 'COMPLETED',
        completedAt,
        attempts: { increment: 1 },
        score,
      },
    });
    const courseProgress = await this.recalcCourseProgress(studentId, courseId, completedAt);
    await this.events.emit('block.completed', {
      studentId,
      blockId: block.id,
      courseId,
      ...(score === null ? {} : { score }),
      at: completedAt.toISOString(),
    });
    this.log.info({ studentId, blockId: block.id, courseId, score }, 'блок пройден');
    return {
      progress: { status: progress.status, attempts: progress.attempts, score: progress.score },
      score,
      courseProgress,
    };
  }

  // ---------- внутреннее ----------

  /** Статусы блоков одним запросом: `blockId → status`. */
  private async blockStatuses(
    studentId: string,
    blockIds: string[],
  ): Promise<Map<string, 'OPENED' | 'COMPLETED'>> {
    if (blockIds.length === 0) return new Map();
    const rows = await this.prisma.blockProgress.findMany({
      where: { studentId, blockId: { in: blockIds } },
      select: { blockId: true, status: true },
    });
    return new Map(rows.map((row) => [row.blockId, row.status]));
  }

  private async requireVisibleCourse(studentId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      include: { modules: { orderBy: { order: 'asc' }, include: { blocks: { orderBy: { order: 'asc' } } } } },
    });
    // Черновик и архив для ученика не существуют: иначе 403 выдал бы факт наличия курса.
    if (!course || course.status !== 'PUBLISHED') throw Errors.notFound('Курс');
    const groupIds = await this.groups.listGroupIdsOfStudent(studentId);
    if (!groupIds.includes(course.groupId)) throw Errors.forbidden('Курс не твоей группы');
    return course;
  }

  private async requireVisibleBlock(
    studentId: string,
    blockId: string,
  ): Promise<{ block: BlockRow; courseId: string }> {
    const block = await this.prisma.courseBlock.findUnique({
      where: { id: blockId },
      include: { module: { select: { courseId: true } } },
    });
    if (!block) throw Errors.notFound('Блок');
    // Проверка курса целиком: она же отсекает черновики и чужие группы.
    await this.requireVisibleCourse(studentId, block.module.courseId);
    return { block, courseId: block.module.courseId };
  }

  /** Read-model `CourseProgress` пересчитывается здесь — владелец модели модуль courses. */
  private async recalcCourseProgress(
    studentId: string,
    courseId: string,
    lastActivityAt: Date,
  ): Promise<CourseProgressBrief> {
    const blocks = await this.prisma.courseBlock.findMany({
      where: { module: { courseId } },
      select: { id: true },
    });
    const completed = await this.prisma.blockProgress.count({
      where: { studentId, status: 'COMPLETED', blockId: { in: blocks.map((b) => b.id) } },
    });
    const data = {
      completedBlocks: completed,
      totalBlocks: blocks.length,
      percent: percentOf(completed, blocks.length),
      lastActivityAt,
    };
    await this.prisma.courseProgress.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId, ...data },
      update: data,
    });
    return {
      percent: data.percent,
      completedBlocks: data.completedBlocks,
      totalBlocks: data.totalBlocks,
    };
  }
}

function requireStudent(user: AuthUser): string {
  if (user.activeRole !== 'STUDENT' || !user.profileId) throw Errors.forbidden('Только для ученика');
  return user.profileId;
}
