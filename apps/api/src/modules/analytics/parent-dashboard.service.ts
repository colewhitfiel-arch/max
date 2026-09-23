import { Injectable } from '@nestjs/common';
import type {
  AssignmentResult,
  AttendanceHistoryItem,
  ChildAnalyticsDto,
  ChildHomeworkProgress,
  GroupHomeworkTasks,
  HomeworkProgressQuery,
  ParentHomeDto,
  Trend,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { dayBounds } from '../../common/time/time';
import { AssignmentsService } from '../assignments/assignments.service';
import { CoursesService } from '../courses/courses.service';
import { FamilyService } from '../family/family.service';
import { IdentityService } from '../identity/identity.service';
import { toTaskDetail } from './homework-details';
import { homeworkTasks, sumHomeworkCounts } from './homework';
import { attendanceRate, completionRate } from './metrics';
import {
  type StudentFacts,
  DAY_MS,
  STATS_DAYS,
  UPCOMING_DAYS,
  StudentFactsService,
  isSubmitted,
} from './student-facts.service';

/** За сколько дней показывать пропуски на главной родителя. */
const MISSED_DAYS = 14;
/** За сколько дней задание считается «новым». */
const NEW_ASSIGNMENT_DAYS = 7;
/** Сколько последних результатов показывать. */
const RECENT_RESULTS = 10;

/**
 * Экраны родителя по ребёнку (docs/07 F9): главная, аналитика, прогресс заданий за окно и
 * задания группы. Цифры — из `StudentFactsService`, доступ — через `FamilyService`.
 * Порог «правильно» у родителя — 30% (docs/04 §4.6), поэтому аудитория `ADULT`.
 */
@Injectable()
export class ParentDashboardService {
  constructor(
    private readonly facts: StudentFactsService,
    private readonly family: FamilyService,
    private readonly identity: IdentityService,
    private readonly assignments: AssignmentsService,
    private readonly courses: CoursesService,
  ) {}

  async getHome(user: AuthUser, studentId: string): Promise<ParentHomeDto> {
    const facts = await this.collectChild(user, studentId);
    const now = new Date();
    const student = await this.studentBrief(studentId);
    const { start, end } = dayBounds(facts.timezone, now);
    const lessons = facts.lessons.map((lesson) => this.facts.withAttendance(lesson, facts));
    const today = lessons.filter(
      (lesson) =>
        Date.parse(lesson.startsAt) >= start.getTime() &&
        Date.parse(lesson.startsAt) < end.getTime(),
    );
    const upcoming = lessons.filter(
      (lesson) =>
        Date.parse(lesson.startsAt) >= end.getTime() &&
        Date.parse(lesson.startsAt) <= now.getTime() + UPCOMING_DAYS * DAY_MS &&
        lesson.status !== 'CANCELLED',
    );
    const missed = lessons.filter(
      (lesson) =>
        lesson.attendance === 'ABSENT' &&
        now.getTime() - Date.parse(lesson.startsAt) <= MISSED_DAYS * DAY_MS,
    );
    const newAssignments = facts.assignments.filter(
      (fact) =>
        fact.publishedAt &&
        now.getTime() - fact.publishedAt.getTime() <= NEW_ASSIGNMENT_DAYS * DAY_MS,
    );
    const overdue = facts.assignments.filter(
      (fact) => !isSubmitted(fact) && fact.dueAt && fact.dueAt.getTime() < now.getTime(),
    );
    return {
      student,
      today,
      upcoming,
      missed,
      newAssignments: this.facts.briefsOf(newAssignments, facts),
      overdue: this.facts.briefsOf(overdue, facts),
      stats: await this.facts.stats(facts, now),
      trend: this.trend(facts, now),
      // Резюме ИИ для родителя появится вместе с инсайтами (AiInsight, workstream C).
      aiSummary: null,
    };
  }

  async getAnalytics(user: AuthUser, studentId: string): Promise<ChildAnalyticsDto> {
    const facts = await this.collectChild(user, studentId);
    const now = new Date();
    const clubHomework = this.facts.clubHomework(facts, 'ADULT', now);
    return {
      stats: await this.facts.stats(facts, now),
      clubs: this.facts.clubs(facts, now),
      weekly: await this.facts.weekly(facts, now),
      recentResults: this.recentResults(facts),
      attendanceHistory: this.attendanceHistory(facts, now),
      aiSummary: null,
      week: this.facts.week(facts, now),
      homework: sumHomeworkCounts(clubHomework.map((item) => item.counts)),
      clubHomework,
    };
  }

  /**
   * «Выполненные задания» за окно (docs/04 §4.6): `done` — сдано за последние `days` дней,
   * `recommended` — задания с дедлайном в том же окне.
   */
  async getHomeworkProgress(
    user: AuthUser,
    studentId: string,
    query: HomeworkProgressQuery,
  ): Promise<ChildHomeworkProgress> {
    const facts = await this.collectChild(user, studentId);
    const since = new Date(Date.now() - query.days * DAY_MS);
    return {
      days: query.days,
      items: facts.groups.map((group) => {
        const ofGroup = facts.assignments.filter((fact) => fact.groupId === group.id);
        return {
          club: group.club,
          group,
          done: ofGroup.filter(
            (fact) =>
              fact.submission?.submittedAt &&
              fact.submission.submittedAt.getTime() >= since.getTime(),
          ).length,
          recommended: ofGroup.filter(
            (fact) => fact.dueAt && fact.dueAt.getTime() >= since.getTime(),
          ).length,
        };
      }),
    };
  }

  async getGroupTasks(
    user: AuthUser,
    studentId: string,
    groupId: string,
  ): Promise<GroupHomeworkTasks> {
    const facts = await this.collectChild(user, studentId);
    const group = facts.groups.find((item) => item.id === groupId);
    if (!group) throw Errors.notFound('Группа');
    return this.groupTasks(facts, groupId, group);
  }

  // ---------- общее для родителя и преподавателя ----------

  /** Сетка заданий группы с условиями и ответами — одинаковая у родителя и преподавателя. */
  async groupTasks(
    facts: StudentFacts,
    groupId: string,
    group: GroupHomeworkTasks['group'],
  ): Promise<GroupHomeworkTasks> {
    const ofGroup = facts.assignments.filter((fact) => fact.groupId === groupId);
    const tasks = homeworkTasks(ofGroup, 'ADULT');
    const byId = new Map(ofGroup.map((fact) => [fact.id, fact]));
    const [answers, blocks] = await Promise.all([
      this.assignments.answersOfStudent(
        facts.studentId,
        ofGroup.map((fact) => fact.id),
      ),
      this.courses.blockContentsByIds(ofGroup.flatMap((fact) => (fact.blockId ? [fact.blockId] : []))),
    ]);
    return {
      group,
      items: tasks.flatMap((task) => {
        const fact = byId.get(task.assignmentId);
        if (!fact) return [];
        const block = fact.blockId ? blocks.get(fact.blockId) : undefined;
        return [toTaskDetail(task, fact, answers.get(fact.id), block)];
      }),
    };
  }

  // ---------- внутреннее ----------

  private async collectChild(user: AuthUser, studentId: string): Promise<StudentFacts> {
    const parentId = requireParent(user);
    await this.family.assertParentLinked(parentId, studentId);
    const studentUserId = await this.identity.userIdOfProfile('STUDENT', studentId);
    return this.facts.collect(studentId, studentUserId ?? '');
  }

  private async studentBrief(studentId: string) {
    const students = await this.identity.studentBriefsByIds([studentId]);
    const student = students.get(studentId);
    if (!student) throw Errors.notFound('Ученик');
    return student;
  }

  /** Разница показателей с предыдущим периодом такой же длины (docs/04 §4.6). */
  private trend(facts: StudentFacts, now: Date): Trend {
    const from = new Date(now.getTime() - STATS_DAYS * DAY_MS);
    const prevFrom = new Date(from.getTime() - STATS_DAYS * DAY_MS);
    const current = {
      attendance: this.facts.attendanceOf(facts, now, { since: from }),
      completion: this.facts.dueIn(facts, from, now),
    };
    const previous = {
      attendance: this.facts.attendanceOf(facts, from, { since: prevFrom }),
      completion: this.facts.dueIn(facts, prevFrom, from),
    };
    const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
    return {
      attendanceDelta: delta(
        attendanceRate(current.attendance.attended, current.attendance.countable),
        attendanceRate(previous.attendance.attended, previous.attendance.countable),
      ),
      completionDelta: delta(
        completionRate(current.completion.doneOnTime, current.completion.due),
        completionRate(previous.completion.doneOnTime, previous.completion.due),
      ),
    };
  }

  private recentResults(facts: StudentFacts): AssignmentResult[] {
    const graded = facts.assignments
      .filter((fact) => fact.submission?.score !== null && fact.submission?.submittedAt)
      .sort(
        (a, b) =>
          (b.submission?.submittedAt?.getTime() ?? 0) - (a.submission?.submittedAt?.getTime() ?? 0),
      )
      .slice(0, RECENT_RESULTS);
    const briefs = new Map(
      this.facts.briefsOf(graded, facts).map((brief) => [brief.id, brief] as const),
    );
    return graded.flatMap((fact) => {
      const assignment = briefs.get(fact.id);
      const submission = fact.submission;
      if (!assignment || !submission?.submittedAt || submission.score === null) return [];
      return [
        {
          assignment,
          score: submission.score,
          maxScore: fact.maxScore,
          submittedAt: submission.submittedAt.toISOString(),
          isLate: submission.isLate,
        },
      ];
    });
  }

  private attendanceHistory(facts: StudentFacts, now: Date): AttendanceHistoryItem[] {
    return this.facts
      .countableLessons(facts, now)
      .flatMap((lesson) => {
        const status = facts.attendance.get(lesson.id);
        return status ? [{ lesson: { ...lesson, attendance: status }, status }] : [];
      })
      .sort((a, b) => Date.parse(b.lesson.startsAt) - Date.parse(a.lesson.startsAt));
  }
}

function requireParent(user: AuthUser): string {
  if (user.activeRole !== 'PARENT' || !user.profileId) throw Errors.forbidden('Только для родителя');
  return user.profileId;
}
