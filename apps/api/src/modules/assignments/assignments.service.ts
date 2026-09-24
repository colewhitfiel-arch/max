import { Inject, Injectable } from '@nestjs/common';
import {
  type AssignmentBrief,
  type AssignmentSubmissions,
  type AssignmentType,
  type CreateAssignmentBody,
  type GradeSubmissionBody,
  type GroupBrief,
  type HomeworkClub,
  type ListStudentAssignmentsQuery,
  type ListTeacherAssignmentsQuery,
  type Paginated,
  type StudentAssignmentDetail,
  type StudentHomeworkDto,
  type SubmissionDto,
  type SubmitAssignmentBody,
  type TeacherAssignmentCard,
  type TeacherSubmissionDetail,
  type UpdateAssignmentBody,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { AppLogger } from '../../common/logger/logger.service';
import { decodeCursor, normalizeLimit, toPage } from '../../common/pagination/cursor';
import { COINS_PER_HOMEWORK, isHomeworkPassed } from '../analytics/gamification';
import { FilesService } from '../files/files.service';
import { GroupsService } from '../groups/groups.service';
import {
  type AssignmentRow,
  type CreateAssignmentData,
  type SubmissionRowModel,
  AssignmentCursorSchema,
  AssignmentsRepository,
} from './assignments.repository';

/** Сколько помнить результат сдачи по `Idempotency-Key` (повтор запроса из-за сети). */
const SUBMIT_REPLAY_TTL_SEC = 24 * 60 * 60;
const DEFAULT_MAX_SCORE = 100;

/** Типы блоков курса, которые при публикации становятся заданиями (docs/07 F8.5). */
export const ASSIGNABLE_BLOCK_TYPES: readonly AssignmentType[] = [
  'QUIZ',
  'QUESTION',
  'PRACTICE',
  'HOMEWORK',
];

export interface BlockAssignmentInput {
  blockId: string;
  type: AssignmentType;
  title: string;
  description?: string | null;
  dueAt?: Date | null;
  maxScore?: number | null;
  allowedAttempts?: number | null;
  studentIds?: string[];
}

const submissionDto = (row: SubmissionRowModel): SubmissionDto => ({
  id: row.id,
  assignmentId: row.assignmentId,
  studentId: row.studentId,
  status: row.status,
  attemptsCount: row.attemptsCount,
  score: row.score,
  fileIds: row.fileIds,
  text: row.text,
  submittedAt: row.submittedAt?.toISOString() ?? null,
  gradedAt: row.gradedAt?.toISOString() ?? null,
  gradedById: row.gradedById,
  feedback: row.feedback,
  isLate: row.isLate,
});

/**
 * Задания и сдачи (docs/07 F7): простые задания преподавателя, задания из блоков курса,
 * сдача и проверка. Адресация — `Assignment.studentIds`: пусто — вся группа, иначе только
 * перечисленные ученики видят задание и сдают его.
 */
@Injectable()
export class AssignmentsService {
  private readonly log;

  constructor(
    private readonly repo: AssignmentsRepository,
    private readonly groups: GroupsService,
    private readonly files: FilesService,
    private readonly events: DomainEventBus,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'assignments' });
  }

  // ---------- преподаватель ----------

  async listTeacher(
    user: AuthUser,
    query: ListTeacherAssignmentsQuery,
  ): Promise<Paginated<TeacherAssignmentCard>> {
    const teacherId = this.requireTeacher(user);
    if (query.groupId) await this.groups.assertTeacherOwnsGroup(teacherId, query.groupId);
    const limit = normalizeLimit(query.limit);
    const rows = await this.repo.listByTeacher(
      teacherId,
      {
        ...(query.groupId ? { groupId: query.groupId } : {}),
        // «Закрытые» — те, у кого срок прошёл; «открытые» — без срока или срок ещё впереди.
        ...(query.status === 'closed' ? { dueBefore: new Date() } : {}),
        ...(query.status === 'open' ? { dueFromOrNull: true } : {}),
      },
      limit,
      decodeCursor(query.cursor, AssignmentCursorSchema),
    );
    const page = toPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    const items = await this.toCards(page.items);
    return { items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
  }

  async create(user: AuthUser, body: CreateAssignmentBody): Promise<TeacherAssignmentCard> {
    const teacherId = this.requireTeacher(user);
    await this.groups.assertTeacherOwnsGroup(teacherId, body.groupId);
    const studentIds = await this.validateTargets(body.groupId, body.studentIds);
    const row = await this.repo.create({
      groupId: body.groupId,
      teacherId,
      courseId: null,
      blockId: null,
      studentIds,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      type: body.type,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      maxScore: body.maxScore ?? DEFAULT_MAX_SCORE,
      allowedAttempts: body.allowedAttempts ?? null,
      publishedAt: body.publish ? new Date() : null,
    });
    this.log.info(
      { assignmentId: row.id, groupId: body.groupId, targets: studentIds.length },
      'задание создано',
    );
    const [card] = await this.toCards([row]);
    return card!;
  }

  async update(
    user: AuthUser,
    assignmentId: string,
    body: UpdateAssignmentBody,
  ): Promise<TeacherAssignmentCard> {
    const row = await this.requireOwned(user, assignmentId);
    const updated = await this.repo.update(row.id, {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      // Снять публикацию нельзя: ученики уже могли увидеть задание и начать его делать.
      ...(body.publish && !row.publishedAt ? { publishedAt: new Date() } : {}),
    });
    const [card] = await this.toCards([updated]);
    return card!;
  }

  async remove(user: AuthUser, assignmentId: string): Promise<void> {
    const row = await this.requireOwned(user, assignmentId);
    await this.repo.softDelete(row.id);
    this.log.info({ assignmentId: row.id }, 'задание удалено');
  }

  async listSubmissions(user: AuthUser, assignmentId: string): Promise<AssignmentSubmissions> {
    const row = await this.requireOwned(user, assignmentId);
    const [cards, roster, submissions] = await Promise.all([
      this.toCards([row]),
      this.groups.listRoster(row.groupId),
      this.repo.listSubmissionsOfAssignment(row.id),
    ]);
    const targets = this.targetsOf(row, roster);
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
    return {
      assignment: cards[0]!,
      rows: targets.map((student) => {
        const submission = byStudent.get(student.id);
        return { student, submission: submission ? submissionDto(submission) : null };
      }),
    };
  }

  async getSubmission(user: AuthUser, submissionId: string): Promise<TeacherSubmissionDetail> {
    const { submission } = await this.requireOwnedSubmission(user, submissionId);
    const [files, attempts] = await Promise.all([
      this.files.listDtosByIds(submission.fileIds),
      this.repo.listAttempts(submission.id),
    ]);
    return {
      ...submissionDto(submission),
      answers: (submission.answers as TeacherSubmissionDetail['answers']) ?? null,
      files,
      attempts: attempts.map((attempt) => ({
        n: attempt.n,
        score: attempt.score,
        submittedAt: attempt.submittedAt.toISOString(),
      })),
    };
  }

  async grade(
    user: AuthUser,
    submissionId: string,
    body: GradeSubmissionBody,
  ): Promise<SubmissionDto> {
    const teacherId = this.requireTeacher(user);
    const { submission, assignment } = await this.requireOwnedSubmission(user, submissionId);
    if (submission.status === 'NOT_STARTED') throw Errors.businessRule('Работа ещё не сдана');
    if (body.score > assignment.maxScore)
      throw Errors.validation(`Балл больше максимума (${assignment.maxScore})`);
    const gradedAt = new Date();
    const updated = await this.repo.grade(submission.id, {
      status: body.status,
      score: body.score,
      feedback: body.feedback?.trim() || null,
      gradedById: teacherId,
      gradedAt,
    });
    await this.events.emit('submission.graded', {
      submissionId: updated.id,
      assignmentId: assignment.id,
      studentId: updated.studentId,
      groupId: assignment.groupId,
      score: body.score,
      maxScore: assignment.maxScore,
      status: body.status,
      at: gradedAt.toISOString(),
    });
    return submissionDto(updated);
  }

  // ---------- ученик ----------

  async listStudent(
    user: AuthUser,
    query: ListStudentAssignmentsQuery,
  ): Promise<Paginated<AssignmentBrief>> {
    const studentId = this.requireStudent(user);
    const groupIds = await this.groups.listGroupIdsOfStudent(studentId);
    const rows = await this.repo.listForStudent(studentId, groupIds);
    const submissions = await this.repo.listSubmissionsOfStudent(
      studentId,
      rows.map((row) => row.id),
    );
    const byAssignment = new Map(submissions.map((s) => [s.assignmentId, s]));
    const status = query.status ?? 'all';
    const filtered = rows.filter((row) => {
      if (status === 'all') return true;
      const done = isDone(byAssignment.get(row.id));
      return status === 'done' ? done : !done;
    });
    const briefs = await this.toBriefs(filtered, byAssignment);
    // Заданий у ученика немного — отдаём одной страницей (курсор не нужен).
    return { items: briefs };
  }

  async getStudent(user: AuthUser, assignmentId: string): Promise<StudentAssignmentDetail> {
    const studentId = this.requireStudent(user);
    const groupIds = await this.groups.listGroupIdsOfStudent(studentId);
    const row = await this.repo.findForStudent(studentId, groupIds, assignmentId);
    if (!row) throw Errors.notFound('Задание');
    const submission = await this.repo.findSubmission(row.id, studentId);
    const [brief] = await this.toBriefs([row], new Map(submission ? [[row.id, submission]] : []));
    return {
      ...brief!,
      description: row.description,
      block: row.blockId && row.courseId ? { id: row.blockId, courseId: row.courseId } : null,
      submission: submission ? submissionDto(submission) : null,
      attemptsLeft:
        row.allowedAttempts === null
          ? null
          : Math.max(0, row.allowedAttempts - (submission?.attemptsCount ?? 0)),
    };
  }

  /** Карта кружков на экране «Задания»: открытые задания и баллы по каждому кружку. */
  async getHomework(user: AuthUser): Promise<StudentHomeworkDto> {
    const studentId = this.requireStudent(user);
    const groups = await this.groups.listGroupBriefsOfStudent(studentId);
    const rows = await this.repo.listForStudent(
      studentId,
      groups.map((group) => group.id),
    );
    const submissions = await this.repo.listSubmissionsOfStudent(
      studentId,
      rows.map((row) => row.id),
    );
    const byAssignment = new Map(submissions.map((s) => [s.assignmentId, s]));
    const clubs: Array<HomeworkClub & { nextDue: number }> = groups.map((group) => {
      const ofGroup = rows.filter((row) => row.groupId === group.id);
      const open = ofGroup
        .filter((row) => !isDone(byAssignment.get(row.id)))
        .sort((a, b) => dueTime(a) - dueTime(b));
      // Кристаллы за правильно выполненные задания кружка (docs/04 §4.6, формула analytics).
      const points =
        ofGroup.filter((row) =>
          isHomeworkPassed(byAssignment.get(row.id)?.score ?? null, row.maxScore),
        ).length * COINS_PER_HOMEWORK;
      const next = open[0];
      return {
        club: group.club,
        group,
        openCount: open.length,
        points,
        nextAssignment: next ? this.brief(next, group, byAssignment.get(next.id)) : null,
        nextDue: next ? dueTime(next) : Number.POSITIVE_INFINITY,
      };
    });
    return {
      clubs: clubs
        .sort((a, b) => a.nextDue - b.nextDue)
        .map(({ nextDue: _nextDue, ...club }) => club),
    };
  }

  async submit(
    user: AuthUser,
    assignmentId: string,
    body: SubmitAssignmentBody,
    idempotencyKey: string,
  ): Promise<SubmissionDto> {
    const studentId = this.requireStudent(user);
    const groupIds = await this.groups.listGroupIdsOfStudent(studentId);
    const row = await this.repo.findForStudent(studentId, groupIds, assignmentId);
    if (!row) throw Errors.notFound('Задание');

    // Повтор того же запроса (сеть) отдаёт прежний результат; тот же ключ на другое задание — конфликт.
    const replayKey = `submit:${studentId}:${idempotencyKey}`;
    const replay = await this.kv.get<{ assignmentId: string; result: SubmissionDto }>(replayKey);
    if (replay) {
      if (replay.assignmentId !== row.id)
        throw Errors.conflict('Ключ идемпотентности уже использован для другого задания');
      return replay.result;
    }

    const existing = await this.repo.findSubmission(row.id, studentId);
    if (row.allowedAttempts !== null && (existing?.attemptsCount ?? 0) >= row.allowedAttempts)
      throw Errors.businessRule('Попытки закончились');
    if (body.fileIds?.length)
      await this.files.listOwnedByPurpose(user.userId, body.fileIds, 'SUBMISSION');

    const submittedAt = new Date();
    const text = body.text?.trim() || null;
    const submission = await this.repo.submit({
      assignmentId: row.id,
      studentId,
      answers: body.answers ?? (text ? { text } : null),
      text,
      fileIds: body.fileIds ?? [],
      isLate: !!row.dueAt && row.dueAt.getTime() < submittedAt.getTime(),
      submittedAt,
    });
    const result = submissionDto(submission);
    await this.kv.set(replayKey, { assignmentId: row.id, result }, SUBMIT_REPLAY_TTL_SEC);
    await this.events.emit('submission.submitted', {
      submissionId: submission.id,
      assignmentId: row.id,
      studentId,
      groupId: row.groupId,
      isLate: submission.isLate,
      attempt: submission.attemptsCount,
      at: submittedAt.toISOString(),
    });
    return result;
  }

  // ---------- публичный сервис (courses) ----------

  /**
   * Создать задания для блоков курса. Идемпотентно по `blockId`: блок, у которого задание уже
   * есть, пропускается — поэтому повторная публикация курса только добавляет новые модули.
   * Возвращает число созданных заданий.
   */
  async createForBlocks(input: {
    teacherId: string;
    groupId: string;
    courseId: string;
    blocks: BlockAssignmentInput[];
  }): Promise<number> {
    if (input.blocks.length === 0) return 0;
    const existing = await this.repo.findBlockIdsWithAssignment(
      input.blocks.map((block) => block.blockId),
    );
    const fresh = input.blocks.filter((block) => !existing.has(block.blockId));
    if (fresh.length === 0) return 0;
    const publishedAt = new Date();
    const rows: CreateAssignmentData[] = fresh.map((block) => ({
      groupId: input.groupId,
      teacherId: input.teacherId,
      courseId: input.courseId,
      blockId: block.blockId,
      studentIds: block.studentIds ?? [],
      title: block.title,
      description: block.description ?? null,
      type: block.type,
      dueAt: block.dueAt ?? null,
      maxScore: block.maxScore ?? DEFAULT_MAX_SCORE,
      allowedAttempts: block.allowedAttempts ?? null,
      publishedAt,
    }));
    const created = await this.repo.createMany(rows);
    this.log.info(
      { courseId: input.courseId, created: created.length },
      'задания курса опубликованы',
    );
    return created.length;
  }

  /**
   * Публичный сервис: выполнение заданий по ученикам группы. Знаменатель — задания со сроком
   * в прошлом, адресованные ученику; числитель — сданные не позже срока (docs/04 §4.6).
   */
  async completionOfGroup(
    groupId: string,
    studentIds: string[],
    before = new Date(),
  ): Promise<Map<string, { doneOnTime: number; due: number }>> {
    const result = new Map(studentIds.map((id) => [id, { doneOnTime: 0, due: 0 }]));
    const assignments = await this.repo.listDueOfGroup(groupId, before);
    if (assignments.length === 0) return result;
    const submissions = await this.repo.listSubmissionsOfAssignments(
      assignments.map((row) => row.id),
    );
    const byKey = new Map(submissions.map((s) => [`${s.assignmentId}:${s.studentId}`, s]));
    for (const assignment of assignments) {
      const targets =
        assignment.studentIds.length > 0
          ? studentIds.filter((id) => assignment.studentIds.includes(id))
          : studentIds;
      for (const studentId of targets) {
        const entry = result.get(studentId);
        if (!entry) continue;
        entry.due += 1;
        const submission = byKey.get(`${assignment.id}:${studentId}`);
        if (submission && !submission.isLate && isDone(submission)) entry.doneOnTime += 1;
      }
    }
    return result;
  }

  /** Публичный сервис: сколько сдач ученики сделали за период (вклад в «активность»). */
  async submissionCountsOfGroup(
    groupId: string,
    studentIds: string[],
    since: Date,
  ): Promise<Map<string, number>> {
    const counts = new Map(studentIds.map((id) => [id, 0]));
    const assignments = await this.repo.listPublishedOfGroup(groupId);
    const submissions = await this.repo.listSubmissionsOfAssignments(
      assignments.map((row) => row.id),
    );
    for (const submission of submissions) {
      if (!submission.submittedAt || submission.submittedAt < since) continue;
      const current = counts.get(submission.studentId);
      if (current !== undefined) counts.set(submission.studentId, current + 1);
    }
    return counts;
  }

  // ---------- внутреннее ----------

  /** Адресаты: пустой список — весь состав группы, иначе только выбранные (и ещё зачисленные). */
  private targetsOf(row: AssignmentRow, roster: Awaited<ReturnType<GroupsService['listRoster']>>) {
    if (row.studentIds.length === 0) return roster;
    const chosen = new Set(row.studentIds);
    return roster.filter((student) => chosen.has(student.id));
  }

  /** Адресаты должны быть в составе группы; пустой список — всей группе. */
  private async validateTargets(groupId: string, studentIds?: string[]): Promise<string[]> {
    if (!studentIds || studentIds.length === 0) return [];
    const enrolled = new Set(await this.groups.listStudentIdsInGroup(groupId));
    const foreign = studentIds.filter((id) => !enrolled.has(id));
    if (foreign.length > 0)
      throw Errors.businessRule('Среди выбранных есть ученики не из этой группы', {
        studentIds: foreign,
      });
    return [...new Set(studentIds)];
  }

  private async toCards(rows: AssignmentRow[]): Promise<TeacherAssignmentCard[]> {
    if (rows.length === 0) return [];
    const [groupsById, counts, rosterSizes] = await Promise.all([
      this.groups.groupBriefsByIds(rows.map((row) => row.groupId)),
      this.repo.countsByAssignment(rows.map((row) => row.id)),
      this.rosterSizes(rows.map((row) => row.groupId)),
    ]);
    return rows.flatMap((row) => {
      const group = groupsById.get(row.groupId);
      if (!group) return [];
      const count = counts.get(row.id) ?? { submitted: 0, graded: 0 };
      return [
        {
          id: row.id,
          title: row.title,
          type: row.type,
          dueAt: row.dueAt?.toISOString() ?? null,
          maxScore: row.maxScore,
          group,
          description: row.description,
          allowedAttempts: row.allowedAttempts,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          studentIds: row.studentIds,
          courseId: row.courseId,
          studentsCount:
            row.studentIds.length > 0 ? row.studentIds.length : (rosterSizes.get(row.groupId) ?? 0),
          submittedCount: count.submitted,
          gradedCount: count.graded,
        },
      ];
    });
  }

  private async rosterSizes(groupIds: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(groupIds)];
    const sizes = await Promise.all(
      unique.map(async (groupId) => {
        const ids = await this.groups.listStudentIdsInGroup(groupId);
        return [groupId, ids.length] as const;
      }),
    );
    return new Map(sizes);
  }

  private brief(
    row: AssignmentRow,
    group: GroupBrief,
    submission: SubmissionRowModel | undefined,
  ): AssignmentBrief {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      dueAt: row.dueAt?.toISOString() ?? null,
      maxScore: row.maxScore,
      group,
      submission: submission
        ? {
            status: submission.status,
            score: submission.score,
            isLate: submission.isLate,
            submittedAt: submission.submittedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private async toBriefs(
    rows: AssignmentRow[],
    byAssignment: Map<string, SubmissionRowModel>,
  ): Promise<AssignmentBrief[]> {
    if (rows.length === 0) return [];
    const groupsById = await this.groups.groupBriefsByIds(rows.map((row) => row.groupId));
    return rows.flatMap((row) => {
      const group = groupsById.get(row.groupId);
      return group ? [this.brief(row, group, byAssignment.get(row.id))] : [];
    });
  }

  private requireTeacher(user: AuthUser): string {
    if (user.activeRole !== 'TEACHER' || !user.profileId)
      throw Errors.forbidden('Только для преподавателя');
    return user.profileId;
  }

  private requireStudent(user: AuthUser): string {
    if (user.activeRole !== 'STUDENT' || !user.profileId)
      throw Errors.forbidden('Только для ученика');
    return user.profileId;
  }

  private async requireOwned(user: AuthUser, assignmentId: string): Promise<AssignmentRow> {
    const teacherId = this.requireTeacher(user);
    const row = await this.repo.findById(assignmentId);
    if (!row || row.teacherId !== teacherId) throw Errors.notFound('Задание');
    return row;
  }

  private async requireOwnedSubmission(
    user: AuthUser,
    submissionId: string,
  ): Promise<{ submission: SubmissionRowModel; assignment: AssignmentRow }> {
    const teacherId = this.requireTeacher(user);
    const submission = await this.repo.findSubmissionById(submissionId);
    if (!submission) throw Errors.notFound('Сдача');
    const assignment = await this.repo.findById(submission.assignmentId);
    if (!assignment || assignment.teacherId !== teacherId) throw Errors.notFound('Сдача');
    return { submission, assignment };
  }
}

/** Задание закрыто для ученика: работа сдана или уже проверена. */
function isDone(submission: SubmissionRowModel | undefined): boolean {
  return submission?.status === 'SUBMITTED' || submission?.status === 'GRADED';
}

function dueTime(row: AssignmentRow): number {
  return row.dueAt ? row.dueAt.getTime() : Number.POSITIVE_INFINITY;
}
