import { Injectable } from '@nestjs/common';
import type {
  CourseBlock,
  CourseDraft,
  CourseProgressReport,
  PublishCourseBody,
  TeacherCourseCard,
  TeacherCourseDetail,
  UpdateBlockBody,
} from '@edu/contracts';
import type { Prisma } from '@edu/db';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type BlockAssignmentInput,
  ASSIGNABLE_BLOCK_TYPES,
  AssignmentsService,
} from '../assignments/assignments.service';
import { GroupsService } from '../groups/groups.service';

/** Блок такого типа при публикации превращается в задание (docs/07 F8.5). */
function isAssignable(type: CourseBlock['type']): type is BlockAssignmentInput['type'] {
  return (ASSIGNABLE_BLOCK_TYPES as readonly string[]).includes(type);
}

const courseStructure = {
  modules: {
    orderBy: { order: 'asc' },
    include: { blocks: { orderBy: { order: 'asc' } } },
  },
} as const;

type CourseWithStructure = Prisma.CourseGetPayload<{ include: typeof courseStructure }>;

/**
 * Курсы преподавателя: структура, публикация и дополнение новыми модулями (docs/07 F8).
 * Курс живёт долго: «Задать ДЗ» добавляет в него модуль, публикация идемпотентна и создаёт
 * задания только для новых блоков — ученик продолжает проходить тот же курс.
 */
@Injectable()
export class CoursesService {
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

  // ---------- создание и дополнение ----------

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
      await this.writeModules(tx, created.id, draft, 0);
      return created;
    });
    return { courseId: course.id };
  }

  /**
   * Дополнить курс модулями черновика: новые модули встают после существующих, содержимое
   * курса не переписывается. Возвращает id созданных модулей (для точечной публикации).
   */
  async appendFromDraft(input: {
    courseId: string;
    draft: CourseDraft;
  }): Promise<{ courseId: string; moduleIds: string[] }> {
    const last = await this.prisma.courseModule.findFirst({
      where: { courseId: input.courseId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const startOrder = (last?.order ?? -1) + 1;
    const moduleIds = await this.prisma.$transaction((tx) =>
      this.writeModules(tx, input.courseId, input.draft, startOrder),
    );
    this.log.info(
      { courseId: input.courseId, modules: moduleIds.length },
      'курс дополнен модулями',
    );
    return { courseId: input.courseId, moduleIds };
  }

  // ---------- ручки преподавателя ----------

  async listTeacherCourses(
    teacherId: string,
    groupId?: string,
  ): Promise<{ items: TeacherCourseCard[] }> {
    if (groupId) await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const rows = await this.prisma.course.findMany({
      where: {
        teacherId,
        deletedAt: null,
        ...(groupId ? { groupId } : {}),
      },
      include: {
        modules: { select: { _count: { select: { blocks: true } } } },
        progress: { select: { percent: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const groupsById = await this.groups.groupBriefsByIds(rows.map((row) => row.groupId));
    return {
      items: rows.flatMap((row) => {
        const group = groupsById.get(row.groupId);
        if (!group) return [];
        const percents = row.progress.map((p) => p.percent);
        return [
          {
            id: row.id,
            title: row.title,
            group,
            status: row.status,
            modulesCount: row.modules.length,
            blocksCount: row.modules.reduce((sum, m) => sum + m._count.blocks, 0),
            publishedAt: row.publishedAt?.toISOString() ?? null,
            avgProgress:
              percents.length === 0
                ? 0
                : Math.round(percents.reduce((a, b) => a + b, 0) / percents.length),
          },
        ];
      }),
    };
  }

  async createCourse(
    teacherId: string,
    body: { groupId: string; title: string; description?: string },
  ): Promise<TeacherCourseDetail> {
    await this.groups.assertTeacherOwnsGroup(teacherId, body.groupId);
    const created = await this.prisma.course.create({
      data: {
        teacherId,
        groupId: body.groupId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        status: 'DRAFT',
      },
      select: { id: true },
    });
    return this.getTeacherCourse(teacherId, created.id);
  }

  async getTeacherCourse(teacherId: string, courseId: string): Promise<TeacherCourseDetail> {
    const row = await this.requireOwned(teacherId, courseId);
    return this.toDetail(row);
  }

  /** Полная замена структуры — только пока курс в DRAFT (контракт). */
  async replaceStructure(
    teacherId: string,
    courseId: string,
    draft: CourseDraft,
  ): Promise<TeacherCourseDetail> {
    const row = await this.requireOwned(teacherId, courseId);
    if (row.status !== 'DRAFT')
      throw Errors.businessRule('Структуру можно менять только у неопубликованного курса');
    await this.prisma.$transaction(async (tx) => {
      await tx.courseModule.deleteMany({ where: { courseId } });
      await tx.course.update({
        where: { id: courseId },
        data: { title: draft.title, description: draft.description ?? null },
      });
      await this.writeModules(tx, courseId, draft, 0);
    });
    return this.getTeacherCourse(teacherId, courseId);
  }

  /**
   * Публикация: курс становится PUBLISHED и блоки-задания превращаются в `Assignment`.
   * Идемпотентна и инкрементальна — блок, у которого задание уже есть, пропускается, поэтому
   * повторный вызов после дополнения курса публикует только новые модули.
   */
  async publishCourse(
    teacherId: string,
    courseId: string,
    body: PublishCourseBody,
    options: {
      /** Публиковать только эти модули (дополнение курса новым ДЗ). */
      onlyModuleIds?: string[];
      /** Параметры для блоков, которых нет в `body.assignments` (срок и адресаты всего модуля). */
      defaults?: { dueAt?: Date | null; studentIds?: string[] };
    } = {},
  ): Promise<{ detail: TeacherCourseDetail; assignmentsCreated: number }> {
    const row = await this.requireOwned(teacherId, courseId);
    if (row.status === 'ARCHIVED') throw Errors.businessRule('Курс в архиве');
    const paramsByBlock = new Map(body.assignments.map((item) => [item.blockId, item]));
    const modules = options.onlyModuleIds
      ? row.modules.filter((module) => options.onlyModuleIds!.includes(module.id))
      : row.modules;

    const blocks: BlockAssignmentInput[] = modules.flatMap((module) =>
      module.blocks.flatMap((block) => {
        if (!isAssignable(block.type as CourseBlock['type'])) return [];
        const params = paramsByBlock.get(block.id);
        return [
          {
            blockId: block.id,
            type: block.type as BlockAssignmentInput['type'],
            title: block.title,
            dueAt: params?.dueAt ? new Date(params.dueAt) : (options.defaults?.dueAt ?? null),
            maxScore: params?.maxScore ?? null,
            allowedAttempts: params?.allowedAttempts ?? null,
            studentIds: params?.studentIds ?? options.defaults?.studentIds ?? [],
          },
        ];
      }),
    );

    const assignmentsCreated = await this.assignments.createForBlocks({
      teacherId,
      groupId: row.groupId,
      courseId,
      blocks,
    });
    const publishedAt = row.publishedAt ?? new Date();
    if (row.status !== 'PUBLISHED')
      await this.prisma.course.update({
        where: { id: courseId },
        data: { status: 'PUBLISHED', publishedAt },
      });

    await this.events.emit('course.published', {
      courseId,
      groupId: row.groupId,
      teacherId,
      blockAssignments: blocks.map((block) => ({
        blockId: block.blockId,
        type: block.type,
        title: block.title,
        ...(block.dueAt ? { dueAt: block.dueAt.toISOString() } : {}),
        ...(block.maxScore ? { maxScore: block.maxScore } : {}),
        ...(block.allowedAttempts ? { allowedAttempts: block.allowedAttempts } : {}),
      })),
      at: new Date().toISOString(),
    });
    this.log.info({ courseId, assignmentsCreated }, 'курс опубликован');
    return { detail: await this.getTeacherCourse(teacherId, courseId), assignmentsCreated };
  }

  /**
   * Правка блока — разрешена и после публикации, но только заголовок и содержимое:
   * структура курса после публикации заморожена (docs/04 §4.5 п.7).
   */
  async updateBlock(
    teacherId: string,
    blockId: string,
    body: UpdateBlockBody,
  ): Promise<CourseBlock> {
    const block = await this.prisma.courseBlock.findUnique({
      where: { id: blockId },
      include: { module: { select: { courseId: true } } },
    });
    if (!block) throw Errors.notFound('Блок');
    await this.requireOwned(teacherId, block.module.courseId);
    if (block.type !== body.type)
      throw Errors.validation('Тип блока в запросе не совпадает с типом блока курса');
    const updated = await this.prisma.courseBlock.update({
      where: { id: blockId },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined
          ? { content: body.content as Prisma.InputJsonValue }
          : {}),
      },
    });
    return updated as unknown as CourseBlock;
  }

  /** Прогресс учеников по курсу: процент и последняя активность по каждому. */
  async getCourseProgress(teacherId: string, courseId: string): Promise<CourseProgressReport> {
    const course = await this.requireOwned(teacherId, courseId);
    const blockIds = course.modules.flatMap((module) => module.blocks.map((block) => block.id));
    const roster = await this.groups.listRoster(course.groupId);
    if (roster.length === 0) return { students: [] };
    const progress = await this.prisma.blockProgress.findMany({
      where: {
        blockId: { in: blockIds },
        studentId: { in: roster.map((student) => student.id) },
        status: 'COMPLETED',
      },
      select: { studentId: true, completedAt: true },
    });
    const byStudent = new Map<string, { completed: number; lastActivityAt: Date | null }>();
    for (const row of progress) {
      const entry = byStudent.get(row.studentId) ?? { completed: 0, lastActivityAt: null };
      entry.completed += 1;
      if (row.completedAt && (!entry.lastActivityAt || row.completedAt > entry.lastActivityAt))
        entry.lastActivityAt = row.completedAt;
      byStudent.set(row.studentId, entry);
    }
    return {
      students: roster.map((student) => {
        const entry = byStudent.get(student.id) ?? { completed: 0, lastActivityAt: null };
        return {
          student,
          percent:
            blockIds.length === 0 ? 0 : Math.round((entry.completed / blockIds.length) * 100),
          completedBlocks: entry.completed,
          lastActivityAt: entry.lastActivityAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async archiveCourse(teacherId: string, courseId: string): Promise<TeacherCourseDetail> {
    await this.requireOwned(teacherId, courseId);
    await this.prisma.course.update({ where: { id: courseId }, data: { status: 'ARCHIVED' } });
    return this.getTeacherCourse(teacherId, courseId);
  }

  /** Курс группы, который можно дополнить: не архивный и принадлежит преподавателю. */
  async assertAppendable(teacherId: string, courseId: string, groupId: string): Promise<void> {
    const row = await this.requireOwned(teacherId, courseId);
    if (row.groupId !== groupId) throw Errors.businessRule('Курс относится к другой группе');
    if (row.status === 'ARCHIVED') throw Errors.businessRule('Курс в архиве — его не дополнить');
  }

  /**
   * Публичный сервис (analytics): проценты прохождения опубликованных курсов ученика
   * по группам — `groupId → [percent, …]`. Считается по блокам, а не по read-модели
   * `CourseProgress`: та обновляется при завершении блока и устаревает, когда преподаватель
   * дополняет курс новыми модулями.
   */
  async progressPercentsOfStudent(
    studentId: string,
    groupIds: string[],
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>(groupIds.map((groupId) => [groupId, []]));
    if (groupIds.length === 0) return result;
    const courses = await this.prisma.course.findMany({
      where: { groupId: { in: groupIds }, status: 'PUBLISHED', deletedAt: null },
      select: { id: true, groupId: true, modules: { select: { blocks: { select: { id: true } } } } },
    });
    const blockIds = courses.flatMap((course) =>
      course.modules.flatMap((module) => module.blocks.map((block) => block.id)),
    );
    const completed = new Set(
      (
        await this.prisma.blockProgress.findMany({
          where: { studentId, status: 'COMPLETED', blockId: { in: blockIds } },
          select: { blockId: true },
        })
      ).map((row) => row.blockId),
    );
    for (const course of courses) {
      const ids = course.modules.flatMap((module) => module.blocks.map((block) => block.id));
      if (ids.length === 0) continue;
      const done = ids.filter((id) => completed.has(id)).length;
      result.get(course.groupId)?.push(Math.round((done / ids.length) * 100));
    }
    return result;
  }

  /**
   * Публичный сервис (analytics): содержимое блоков по id — условие задания и эталонный
   * ответ в отчётах родителя и преподавателя. Ученику это содержимое не отдаётся.
   */
  async blockContentsByIds(blockIds: string[]): Promise<Map<string, CourseBlock>> {
    const unique = [...new Set(blockIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.courseBlock.findMany({ where: { id: { in: unique } } });
    return new Map(rows.map((row) => [row.id, row as unknown as CourseBlock]));
  }

  /** Публичный сервис (analytics): сколько блоков ученик прошёл с указанного момента. */
  async countBlocksCompletedSince(studentId: string, since: Date): Promise<number> {
    return this.prisma.blockProgress.count({
      where: { studentId, status: 'COMPLETED', completedAt: { gte: since } },
    });
  }

  // ---------- для контекста ИИ ----------

  /** Курсы ученика с прогрессом — для контекста ИИ. */
  async listStudentCourseProgress(
    studentId: string,
  ): Promise<Array<{ courseId: string; title: string; percent: number; nextBlockTitle?: string }>> {
    // Фильтр по статусу — в запросе: иначе take отрезал бы опубликованные курсы за черновиками
    const rows = await this.prisma.courseProgress.findMany({
      where: { studentId, course: { status: 'PUBLISHED' } },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    return rows.map((r) => ({ courseId: r.course.id, title: r.course.title, percent: r.percent }));
  }

  // ---------- внутреннее ----------

  private async writeModules(
    tx: Prisma.TransactionClient,
    courseId: string,
    draft: CourseDraft,
    startOrder: number,
  ): Promise<string[]> {
    const moduleIds: string[] = [];
    for (const [index, module] of draft.modules.entries()) {
      const createdModule = await tx.courseModule.create({
        data: {
          courseId,
          order: startOrder + index,
          title: module.title,
          summary: module.summary ?? null,
        },
        select: { id: true },
      });
      moduleIds.push(createdModule.id);
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
    return moduleIds;
  }

  private async requireOwned(teacherId: string, courseId: string): Promise<CourseWithStructure> {
    const row = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      include: courseStructure,
    });
    if (!row || row.teacherId !== teacherId) throw Errors.notFound('Курс');
    return row;
  }

  private async toDetail(row: CourseWithStructure): Promise<TeacherCourseDetail> {
    const groupsById = await this.groups.groupBriefsByIds([row.groupId]);
    const group = groupsById.get(row.groupId);
    if (!group) throw Errors.internal('Группа курса не найдена');
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      group,
      status: row.status,
      version: row.version,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      modules: row.modules.map((module) => ({
        id: module.id,
        title: module.title,
        summary: module.summary,
        order: module.order,
        blocks: module.blocks.map(
          (block) =>
            ({
              id: block.id,
              moduleId: block.moduleId,
              order: block.order,
              type: block.type,
              title: block.title,
              content: block.content,
              estimatedMinutes: block.estimatedMinutes,
              isRequired: block.isRequired,
            }) as CourseBlock,
        ),
      })),
    };
  }
}
