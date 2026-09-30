import { Inject, Injectable } from '@nestjs/common';
import {
  type AssignmentBrief,
  type BlockAnswers,
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
import { runIdempotent } from '../../common/kv/idempotency';
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

/**
 * Задание глазами analytics: только факты (срок, максимум, лучшая сдача) без формул.
 * Даты — `Date`, чтобы считающий модуль не разбирал строки.
 */
export interface StudentAssignmentFact {
  id: string;
  title: string;
  description: string | null;
  /** Блок курса, из которого выросло задание; null — «простое» задание преподавателя. */
  blockId: string | null;
  type: AssignmentType;
  groupId: string;
  dueAt: Date | null;
  publishedAt: Date | null;
  maxScore: number;
  submission: {
    status: SubmissionDto['status'];
    score: number | null;
    isLate: boolean;
    submittedAt: Date | null;
  } | null;
}

/** Ответ ученика на задание: что показать в отчётах родителя и преподавателя. */
export interface StudentAnswerFact {
  text: string | null;
  answers: BlockAnswers | null;
  score: number | null;
  isGraded: boolean;
}

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
    // Ключ занимается атомарно до сдачи: параллельный запрос с тем же ключом не потратит попытку.
    const replayKey = `submit:${studentId}:${idempotencyKey}`;
    const { value: stored, replayed } = await runIdempotent(
      this.kv,
      replayKey,
      SUBMIT_REPLAY_TTL_SEC,
      async (): Promise<{ assignmentId: string; result: SubmissionDto }> => {
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
        return { assignmentId: row.id, result: submissionDto(submission) };
      },
    );
    if (stored.assignmentId !== row.id)
      throw Errors.conflict('Ключ идемпотентности уже использован для другого задания');
    const { result } = stored;
    if (replayed) return result;
    await this.events.emit('submission.submitted', {
      submissionId: result.id,
      assignmentId: row.id,
      studentId,
      groupId: row.groupId,
      isLate: result.isLate,
      attempt: result.attemptsCount,
      at: result.submittedAt ?? new Date().toISOString(),
    });
    return result;
  }

  // ---------- публичный сервис (courses, analytics, notifications) ----------

  /**
   * Публичный сервис: сдачи по заданиям группы со сроком в периоде — пары «задание × ученик»
   * для счётчиков «Общей успеваемости» (docs/04 §4.6). Задания без сдач не возвращаются.
   */
  async factsOfGroupInPeriod(
    groupId: string,
    from: Date,
    to: Date,
  ): Promise<StudentAssignmentFact[]> {
    const rows = await this.repo.listOfGroupDueBetween(groupId, from, to);
    if (rows.length === 0) return [];
    const submissions = await this.repo.listSubmissionsOfAssignments(rows.map((row) => row.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return submissions.flatMap((submission) => {
      const row = byId.get(submission.assignmentId);
      if (!row) return [];
      if (submission.status !== 'SUBMITTED' && submission.status !== 'GRADED') return [];
      return [
        {
          id: row.id,
          title: row.title,
          description: row.description,
          blockId: row.blockId,
          type: row.type,
          groupId: row.groupId,
          dueAt: row.dueAt,
          publishedAt: row.publishedAt,
          maxScore: row.maxScore,
          submission: {
            status: submission.status,
            score: submission.score,
            isLate: submission.isLate,
            submittedAt: submission.submittedAt,
          },
        },
      ];
    });
  }

  /**
   * Публичный сервис: задания преподавателя, где есть неоценённые сдачи («Проверить»
   * на главной). Отсортированы по сроку: сначала то, что горит.
   */
  async toGradeOfTeacher(
    teacherId: string,
  ): Promise<Array<{ assignment: AssignmentBrief; pendingCount: number }>> {
    const rows = await this.repo.listByTeacher(teacherId, {}, 200, null);
    if (rows.length === 0) return [];
    const submissions = await this.repo.listSubmissionsOfAssignments(rows.map((row) => row.id));
    const pending = new Map<string, number>();
    for (const submission of submissions) {
      if (submission.status !== 'SUBMITTED') continue;
      pending.set(submission.assignmentId, (pending.get(submission.assignmentId) ?? 0) + 1);
    }
    const waiting = rows.filter((row) => pending.has(row.id));
    const briefs = await this.toBriefs(waiting, new Map());
    return briefs
      .map((assignment) => ({ assignment, pendingCount: pending.get(assignment.id) ?? 0 }))
      .sort(
        (a, b) =>
          (a.assignment.dueAt ? Date.parse(a.assignment.dueAt) : Number.POSITIVE_INFINITY) -
          (b.assignment.dueAt ? Date.parse(b.assignment.dueAt) : Number.POSITIVE_INFINITY),
      );
  }

  /** Публичный сервис: кому принадлежит задание и как оно называется (тексты уведомлений). */
  async briefInfo(
    assignmentId: string,
  ): Promise<{ id: string; title: string; teacherId: string; groupId: string } | null> {
    const row = await this.repo.findById(assignmentId);
    if (!row) return null;
    return { id: row.id, title: row.title, teacherId: row.teacherId, groupId: row.groupId };
  }

  /**
   * Публичный сервис: все видимые ученику задания с его лучшей сдачей — источник цифр
   * для analytics (кристаллы, выполнение заданий, сетки статусов). Формул здесь нет.
   */
  async factsOfStudent(studentId: string, groupIds: string[]): Promise<StudentAssignmentFact[]> {
    const rows = await this.repo.listForStudent(studentId, groupIds);
    const submissions = await this.repo.listSubmissionsOfStudent(
      studentId,
      rows.map((row) => row.id),
    );
    const byAssignment = new Map(submissions.map((s) => [s.assignmentId, s]));
    return rows.map((row) => {
      const submission = byAssignment.get(row.id);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        blockId: row.blockId,
        type: row.type,
        groupId: row.groupId,
        dueAt: row.dueAt,
        publishedAt: row.publishedAt,
        maxScore: row.maxScore,
        submission: submission
          ? {
              status: submission.status,
              score: submission.score,
              isLate: submission.isLate,
              submittedAt: submission.submittedAt,
            }
          : null,
      };
    });
  }

  /**
   * Публичный сервис: условие задания и ответ ученика — экраны «Задания» у родителя
   * и преподавателя. Ключ — id задания.
   */
  async answersOfStudent(
    studentId: string,
    assignmentIds: string[],
  ): Promise<Map<string, StudentAnswerFact>> {
    if (assignmentIds.length === 0) return new Map();
    const submissions = await this.repo.listSubmissionsOfStudent(studentId, assignmentIds);
    return new Map(
      submissions.map((submission) => [
        submission.assignmentId,
        {
          text: submission.text,
          answers: (submission.answers ?? null) as BlockAnswers | null,
          score: submission.score,
          isGraded: submission.status === 'GRADED',
        },
      ]),
    );
  }

  /** Публичный сервис: задания ученика как `AssignmentBrief` (списки на дашбордах). */
  async briefsOfStudent(studentId: string, groupIds: string[]): Promise<AssignmentBrief[]> {
    const rows = await this.repo.listForStudent(studentId, groupIds);
    const submissions = await this.repo.listSubmissionsOfStudent(
      studentId,
      rows.map((row) => row.id),
    );
    return this.toBriefs(rows, new Map(submissions.map((s) => [s.assignmentId, s])));
  }

  /**
   * Задание блока курса глазами ученика; null — блок заданием не стал или адресован не ему.
   * Доступ к самому блоку (курс опубликован, группа своя) проверяет вызывающий модуль courses.
   */
  async briefOfBlockForStudent(
    studentId: string,
    blockId: string,
  ): Promise<AssignmentBrief | null> {
    const row = await this.repo.findForStudentByBlock(studentId, blockId);
    if (!row) return null;
    const submission = await this.repo.findSubmission(row.id, studentId);
    const [brief] = await this.toBriefs([row], new Map(submission ? [[row.id, submission]] : []));
    return brief ?? null;
  }

  /**
   * Публичный сервис для courses: сдача задания блока курса — что нужно, чтобы засчитать блок
   * и проверить тест автоматически. null — сдачи нет или задание не из блока курса.
   */
  async blockSubmission(submissionId: string): Promise<{
    submissionId: string;
    blockId: string;
    studentId: string;
    answers: BlockAnswers | null;
  } | null> {
    const submission = await this.repo.findSubmissionById(submissionId);
    if (!submission) return null;
    const assignment = await this.repo.findById(submission.assignmentId);
    if (!assignment?.blockId) return null;
    return {
      submissionId: submission.id,
      blockId: assignment.blockId,
      studentId: submission.studentId,
      answers: (submission.answers ?? null) as BlockAnswers | null,
    };
  }

  /**
   * Публичный сервис для courses: автопроверка теста из курса. Доля верных ответов (0–100)
   * переводится в шкалу задания; проверяющим записывается автор задания, событие
   * `submission.graded` — как при ручной проверке (уведомления, аналитика).
   */
  async autoGrade(submissionId: string, percent: number, feedback: string): Promise<void> {
    const submission = await this.repo.findSubmissionById(submissionId);
    if (!submission || submission.status !== 'SUBMITTED') return;
    const assignment = await this.repo.findById(submission.assignmentId);
    if (!assignment) return;
    const score = Math.round((Math.min(100, Math.max(0, percent)) * assignment.maxScore) / 100);
    const gradedAt = new Date();
    await this.repo.grade(submission.id, {
      status: 'GRADED',
      score,
      feedback,
      gradedById: assignment.teacherId,
      gradedAt,
    });
    await this.events.emit('submission.graded', {
      submissionId: submission.id,
      assignmentId: assignment.id,
      studentId: submission.studentId,
      groupId: assignment.groupId,
      score,
      maxScore: assignment.maxScore,
      status: 'GRADED',
      at: gradedAt.toISOString(),
    });
  }

  /**
   * Публичный сервис для courses: последняя сдача ученика по заданию блока — разбор теста в
   * плеере курса. `attemptsLeft` null — попытки не ограничены. null — задания или сдачи нет.
   */
  async lastBlockAnswersOfStudent(
    studentId: string,
    blockId: string,
  ): Promise<{ answers: BlockAnswers | null; attemptsLeft: number | null } | null> {
    const row = await this.repo.findForStudentByBlock(studentId, blockId);
    if (!row) return null;
    const submission = await this.repo.findSubmission(row.id, studentId);
    if (!submission || submission.status === 'NOT_STARTED') return null;
    return {
      answers: (submission.answers ?? null) as BlockAnswers | null,
      attemptsLeft:
        row.allowedAttempts === null
          ? null
          : Math.max(0, row.allowedAttempts - submission.attemptsCount),
    };
  }

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
   * в прошлом, адресованные ученику, и срок не раньше его зачисления в группу; числитель —
   * сданные не позже срока (docs/04 §4.6).
   */
  async completionOfGroup(
    groupId: string,
    studentIds: string[],
    before = new Date(),
  ): Promise<Map<string, { doneOnTime: number; due: number }>> {
    const result = new Map(studentIds.map((id) => [id, { doneOnTime: 0, due: 0 }]));
    const assignments = await this.repo.listDueOfGroup(groupId, before);
    if (assignments.length === 0) return result;
    const [submissions, enrolledAt] = await Promise.all([
      this.repo.listSubmissionsOfAssignments(assignments.map((row) => row.id)),
      this.groups.enrolledAtInGroup(groupId),
    ]);
    const byKey = new Map(submissions.map((s) => [`${s.assignmentId}:${s.studentId}`, s]));
    for (const assignment of assignments) {
      const targets =
        assignment.studentIds.length > 0
          ? studentIds.filter((id) => assignment.studentIds.includes(id))
          : studentIds;
      for (const studentId of targets) {
        const entry = result.get(studentId);
        if (!entry) continue;
        // Срок прошёл до прихода ученика в группу — задание ему не в счёт.
        const since = enrolledAt.get(studentId);
        if (since && assignment.dueAt && assignment.dueAt.getTime() < since.getTime()) continue;
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
  private targetsOf<T extends { id: string }>(row: AssignmentRow, roster: T[]): T[] {
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
    const [groupsById, rosters] = await Promise.all([
      this.groups.groupBriefsByIds(rows.map((row) => row.groupId)),
      this.rosterIds(rows.map((row) => row.groupId)),
    ]);
    // Адресаты — текущий состав, как на экране сдач: убранные из группы в счётчики не входят.
    const targets = new Map(
      rows.map((row) => [
        row.id,
        this.targetsOf(row, rosters.get(row.groupId) ?? []).map((student) => student.id),
      ]),
    );
    const counts = await this.repo.countsByAssignment(targets);
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
          studentsCount: targets.get(row.id)?.length ?? 0,
          submittedCount: count.submitted,
          gradedCount: count.graded,
        },
      ];
    });
  }

  /** Текущий состав (ACTIVE) групп: `groupId → [{ id }]`. */
  private async rosterIds(groupIds: string[]): Promise<Map<string, Array<{ id: string }>>> {
    const unique = [...new Set(groupIds)];
    const rosters = await Promise.all(
      unique.map(async (groupId) => {
        const ids = await this.groups.listStudentIdsInGroup(groupId);
        return [groupId, ids.map((id) => ({ id }))] as const;
      }),
    );
    return new Map(rosters);
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
