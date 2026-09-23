import { Injectable } from '@nestjs/common';
import type {
  AssignmentHistoryItem,
  AttendanceHistoryItem,
  GroupHomeworkTasks,
  TeacherHomeDto,
  TeacherPerformanceDto,
  TeacherPerformancePeriod,
  TeacherPerformanceQuery,
  TeacherStudentCard,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { dayBounds } from '../../common/time/time';
import { AssignmentsService } from '../assignments/assignments.service';
import { AttendanceService } from '../attendance/attendance.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SchoolService } from '../school/school.service';
import { homeworkStatus, sumHomeworkCounts } from './homework';
import { ParentDashboardService } from './parent-dashboard.service';
import {
  type StudentFacts,
  DAY_MS,
  STATS_DAYS,
  UPCOMING_DAYS,
  ATTENDED,
  StudentFactsService,
} from './student-facts.service';
import { TeacherGroupsService } from './teacher-groups.service';

/** Сколько событий показывать на главной преподавателя (контракт). */
const EVENTS_LIMIT = 5;
/** Ниже этой посещаемости ученик «требует внимания» (docs/04 §4.6). */
const LOW_ATTENDANCE = 0.7;
/** Столько просроченных сдач подряд — тоже. */
const OVERDUE_IN_ROW = 2;
/** Столько дней без активности — тоже. */
const IDLE_DAYS = 14;
/** Средний балл по последним трём проверенным ниже этого — тоже. */
const LOW_SCORE_RATIO = 0.5;
/** Учебный год начинается 1 сентября. */
const COURSE_START_MONTH = 8;

/**
 * Экраны преподавателя (docs/07 F16–F18): главная, карточка ученика, его задания и
 * «Общая успеваемость». Показатели ученика считаются по тем же формулам, что у родителя,
 * но только по группам этого преподавателя.
 */
@Injectable()
export class TeacherDashboardService {
  constructor(
    private readonly facts: StudentFactsService,
    private readonly groups: GroupsService,
    private readonly attendance: AttendanceService,
    private readonly assignments: AssignmentsService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
    private readonly notifications: NotificationsService,
    private readonly teacherGroups: TeacherGroupsService,
    private readonly parent: ParentDashboardService,
  ) {}

  async getHome(user: AuthUser): Promise<TeacherHomeDto> {
    const teacherId = requireTeacher(user);
    const now = new Date();
    const timezone = await this.timezoneOf(teacherId);
    const { start, end } = dayBounds(timezone, now);
    const [{ items: groups }, toGrade, events] = await Promise.all([
      this.teacherGroups.listGroups(teacherId),
      this.assignments.toGradeOfTeacher(teacherId),
      this.notifications.latestOf(user.userId, EVENTS_LIMIT),
    ]);
    const lessons = await this.groups.listLessons(
      groups.map((group) => group.id),
      start,
      new Date(now.getTime() + UPCOMING_DAYS * DAY_MS),
    );
    const rates = (values: Array<number | null>) => {
      const known = values.filter((value): value is number => value !== null);
      return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
    };
    return {
      today: lessons.filter((lesson) => Date.parse(lesson.startsAt) < end.getTime()),
      upcoming: lessons.filter(
        (lesson) => Date.parse(lesson.startsAt) >= end.getTime() && lesson.status !== 'CANCELLED',
      ),
      groups,
      toGrade,
      events,
      stats: {
        groupsCount: groups.length,
        studentsCount: groups.reduce((sum, group) => sum + group.studentsCount, 0),
        avgAttendanceRate: rates(groups.map((group) => group.attendanceRate)),
        avgCompletionRate: rates(groups.map((group) => group.completionRate)),
        needsAttentionCount: groups.reduce((sum, group) => sum + group.needsAttentionCount, 0),
      },
    };
  }

  async getStudent(user: AuthUser, studentId: string): Promise<TeacherStudentCard> {
    const facts = await this.collectStudent(user, studentId);
    const now = new Date();
    const student = (await this.identity.studentBriefsByIds([studentId])).get(studentId);
    if (!student) throw Errors.notFound('Ученик');
    // Порог «правильно» у преподавателя — родительский, 30% (docs/04 §4.6).
    const clubHomework = this.facts.clubHomework(facts, 'ADULT', now);
    return {
      student,
      groups: facts.groups,
      stats: await this.facts.stats(facts, now),
      clubs: this.facts.clubs(facts, now),
      weekly: await this.facts.weekly(facts, now),
      history: this.history(facts),
      attendanceHistory: this.attendanceHistory(facts, now),
      // Резюме ИИ по ученику появится вместе с инсайтами (AiInsight, workstream C).
      aiSummary: null,
      needsAttention: this.needsAttention(facts, now),
      week: this.facts.week(facts, now),
      homework: sumHomeworkCounts(clubHomework.map((item) => item.counts)),
      clubHomework,
    };
  }

  async getStudentGroupTasks(
    user: AuthUser,
    studentId: string,
    groupId: string,
  ): Promise<GroupHomeworkTasks> {
    const teacherId = requireTeacher(user);
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const facts = await this.collectStudent(user, studentId);
    const group = facts.groups.find((item) => item.id === groupId);
    if (!group) throw Errors.notFound('Группа');
    return this.parent.groupTasks(facts, groupId, group);
  }

  /** «Общая успеваемость»: счётчики по каждой активной группе за период (docs/04 §4.6). */
  async getPerformance(
    user: AuthUser,
    query: TeacherPerformanceQuery,
  ): Promise<TeacherPerformanceDto> {
    const teacherId = requireTeacher(user);
    const timezone = await this.timezoneOf(teacherId);
    const to = new Date();
    const from = this.periodStart(query.period, timezone, to);
    const briefs = await this.groups.listGroupBriefsByTeacher(teacherId);
    const groups = await Promise.all(
      briefs.map(async (group) => {
        const [roster, lessons, assignments] = await Promise.all([
          this.groups.listRoster(group.id),
          this.groups.listLessons([group.id], from, to),
          this.assignments.factsOfGroupInPeriod(group.id, from, to),
        ]);
        const countable = lessons.filter(
          (lesson) => lesson.status !== 'CANCELLED' && Date.parse(lesson.startsAt) <= to.getTime(),
        );
        const marks = await Promise.all(
          roster.map((student) =>
            this.attendance.statusesOfStudent(
              student.id,
              countable.map((lesson) => lesson.id),
            ),
          ),
        );
        const statuses = marks.flatMap((map) => [...map.values()]);
        const done = assignments.filter((fact) => fact.submission?.submittedAt);
        return {
          group,
          studentsCount: roster.length,
          attended: statuses.filter((status) => ATTENDED.includes(status)).length,
          missed: statuses.filter((status) => status === 'ABSENT' || status === 'EXCUSED').length,
          homeworkDone: done.length,
          homeworkCorrect: done.filter((fact) => homeworkStatus(fact, 'ADULT', to) === 'DONE')
            .length,
        };
      }),
    );
    return { period: query.period, from: from.toISOString(), to: to.toISOString(), groups };
  }

  // ---------- внутреннее ----------

  private async collectStudent(user: AuthUser, studentId: string): Promise<StudentFacts> {
    const teacherId = requireTeacher(user);
    const groups = await this.groups.listGroupBriefsByTeacher(teacherId);
    const studentGroupIds = await this.groups.listGroupIdsOfStudent(studentId);
    const shared = groups.map((group) => group.id).filter((id) => studentGroupIds.includes(id));
    if (shared.length === 0) throw Errors.forbidden('Ученик не занимается в ваших группах');
    const studentUserId = await this.identity.userIdOfProfile('STUDENT', studentId);
    return this.facts.collect(studentId, studentUserId ?? '', { onlyGroupIds: shared });
  }

  private async timezoneOf(teacherId: string): Promise<string> {
    const schoolId = await this.identity.getTeacherSchoolId(teacherId);
    return schoolId ? this.school.timezone(schoolId) : 'Europe/Moscow';
  }

  private periodStart(period: TeacherPerformancePeriod, timezone: string, now: Date): Date {
    const { start } = dayBounds(timezone, now);
    if (period === 'day') return start;
    if (period === 'week') return new Date(start.getTime() - 6 * DAY_MS);
    if (period === 'month') return new Date(start.getTime() - 29 * DAY_MS);
    // Учебный год: с 1 сентября текущего года, а до сентября — с прошлого.
    const year =
      now.getUTCMonth() >= COURSE_START_MONTH ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return new Date(Date.UTC(year, COURSE_START_MONTH, 1));
  }

  private history(facts: StudentFacts): AssignmentHistoryItem[] {
    const submitted = facts.assignments
      .filter((fact) => fact.submission?.submittedAt)
      .sort(
        (a, b) =>
          (b.submission?.submittedAt?.getTime() ?? 0) - (a.submission?.submittedAt?.getTime() ?? 0),
      );
    const briefs = new Map(
      this.facts.briefsOf(submitted, facts).map((brief) => [brief.id, brief] as const),
    );
    return submitted.flatMap((fact) => {
      const assignment = briefs.get(fact.id);
      const submittedAt = fact.submission?.submittedAt;
      if (!assignment || !submittedAt) return [];
      return [
        {
          assignment,
          score: fact.submission?.score ?? null,
          isLate: fact.submission?.isLate ?? false,
          submittedAt: submittedAt.toISOString(),
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

  /** Причины «требует внимания» (docs/04 §4.6). */
  private needsAttention(facts: StudentFacts, now: Date): string[] {
    const reasons: string[] = [];
    const from = new Date(now.getTime() - STATS_DAYS * DAY_MS);
    const attendance = this.facts.attendanceOf(facts, now, { since: from });
    if (attendance.countable > 0 && attendance.attended / attendance.countable < LOW_ATTENDANCE)
      reasons.push('Низкая посещаемость');

    const overdue = [...facts.assignments]
      .filter((fact) => fact.dueAt && fact.dueAt.getTime() < now.getTime())
      .sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0));
    let row = 0;
    for (const fact of overdue) {
      const late = !fact.submission?.submittedAt || fact.submission.isLate;
      if (!late) break;
      row += 1;
    }
    if (row >= OVERDUE_IN_ROW) reasons.push('Просроченные сдачи подряд');

    const lastActivity = Math.max(
      0,
      ...facts.assignments.map((fact) => fact.submission?.submittedAt?.getTime() ?? 0),
      ...this.facts
        .countableLessons(facts, now)
        .filter((lesson) => {
          const status = facts.attendance.get(lesson.id);
          return status && ATTENDED.includes(status);
        })
        .map((lesson) => Date.parse(lesson.startsAt)),
    );
    if (now.getTime() - lastActivity > IDLE_DAYS * DAY_MS)
      reasons.push(`Нет активности больше ${IDLE_DAYS} дней`);

    const lastScores = facts.assignments
      .filter((fact) => fact.submission?.score !== null && fact.submission?.submittedAt)
      .sort(
        (a, b) =>
          (b.submission?.submittedAt?.getTime() ?? 0) - (a.submission?.submittedAt?.getTime() ?? 0),
      )
      .slice(0, 3);
    if (lastScores.length === 3) {
      const avg =
        lastScores.reduce(
          (sum, fact) => sum + (fact.submission?.score ?? 0) / Math.max(1, fact.maxScore),
          0,
        ) / lastScores.length;
      if (avg < LOW_SCORE_RATIO) reasons.push('Низкий средний балл');
    }
    return reasons;
  }
}

function requireTeacher(user: AuthUser): string {
  if (user.activeRole !== 'TEACHER' || !user.profileId)
    throw Errors.forbidden('Только для преподавателя');
  return user.profileId;
}
