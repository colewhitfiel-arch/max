import { Injectable } from '@nestjs/common';
import type {
  AssignmentBrief,
  AttendanceStatus,
  ClubHomework,
  ClubProgress,
  GroupBrief,
  LessonDto,
  StatsBrief,
  WeekDay,
  WeeklyPoint,
} from '@edu/contracts';
import { addDays, toDateOnly, weekStart } from '../../common/time/time';
import { AiActivityService } from '../ai/ai-activity.service';
import { type StudentAssignmentFact, AssignmentsService } from '../assignments/assignments.service';
import { AttendanceService } from '../attendance/attendance.service';
import { CoursesService } from '../courses/courses.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';
import { coins, streakDays } from './gamification';
import { type HomeworkAudience, homeworkCounts, homeworkTasks } from './homework';
import { activityScore, attendanceRate, clubProgress, completionRate } from './metrics';

export const DAY_MS = 86_400_000;
/** Окно показателей по умолчанию (docs/04 §4.6). */
export const STATS_DAYS = 30;
/** Окно «активности» (docs/04 §4.6 — неделя). */
export const ACTIVITY_DAYS = 7;
/** Насколько вперёд смотрят блоки «Ближайшие занятия». */
export const UPCOMING_DAYS = 7;
/** Сколько недель показывает «динамика». */
const WEEKLY_WEEKS = 4;

export const ATTENDED: AttendanceStatus[] = ['PRESENT', 'LATE'];

export const isSubmitted = (fact: StudentAssignmentFact): boolean =>
  fact.submission?.status === 'SUBMITTED' || fact.submission?.status === 'GRADED';

/** Факты одного ученика, из которых считаются все цифры экранов всех ролей. */
export interface StudentFacts {
  studentId: string;
  /** Переписка с тьютором привязана к пользователю, а не к профилю ученика. */
  userId: string;
  timezone: string;
  groups: GroupBrief[];
  enrolledAt: Map<string, Date>;
  /** Занятия групп за окно показателей и на неделю вперёд. */
  lessons: LessonDto[];
  attendance: Map<string, AttendanceStatus>;
  assignments: StudentAssignmentFact[];
  progressByGroup: Map<string, number[]>;
}

/**
 * Сбор фактов по ученику и расчёт показателей из них. Один источник цифр для главной и
 * профиля ученика, аналитики родителя и карточки ученика у преподавателя — иначе одни и те же
 * показатели разъезжались бы по экранам. Формулы берутся из `metrics`/`gamification`/`homework`.
 */
@Injectable()
export class StudentFactsService {
  constructor(
    private readonly groups: GroupsService,
    private readonly attendance: AttendanceService,
    private readonly assignments: AssignmentsService,
    private readonly courses: CoursesService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
    private readonly ai: AiActivityService,
  ) {}

  /**
   * @param onlyGroupIds ограничить группами (преподаватель видит только свои).
   * @param daysBack окно выборки занятий назад; по умолчанию окно показателей.
   */
  async collect(
    studentId: string,
    userId: string,
    options: { onlyGroupIds?: string[]; daysBack?: number } = {},
  ): Promise<StudentFacts> {
    const profile = await this.identity.getStudentProfile(studentId);
    const timezone = profile?.schoolId
      ? await this.school.timezone(profile.schoolId)
      : 'Europe/Moscow';
    const [allGroups, enrollments] = await Promise.all([
      this.groups.listGroupBriefsOfStudent(studentId),
      this.groups.listEnrollmentsOfStudent(studentId),
    ]);
    const allowed = options.onlyGroupIds ? new Set(options.onlyGroupIds) : null;
    const groups = allowed ? allGroups.filter((group) => allowed.has(group.id)) : allGroups;
    const groupIds = groups.map((group) => group.id);
    const now = new Date();
    const lessons = await this.groups.listLessons(
      groupIds,
      new Date(now.getTime() - (options.daysBack ?? STATS_DAYS) * DAY_MS),
      new Date(now.getTime() + UPCOMING_DAYS * DAY_MS),
    );
    const [attendance, assignments, progressByGroup] = await Promise.all([
      this.attendance.statusesOfStudent(
        studentId,
        lessons.map((lesson) => lesson.id),
      ),
      this.assignments.factsOfStudent(studentId, groupIds),
      this.courses.progressPercentsOfStudent(studentId, groupIds),
    ]);
    return {
      studentId,
      userId,
      timezone,
      groups,
      enrolledAt: new Map(enrollments.map((row) => [row.groupId, row.enrolledAt])),
      lessons,
      attendance,
      assignments,
      progressByGroup,
    };
  }

  withAttendance(lesson: LessonDto, facts: StudentFacts): LessonDto {
    return { ...lesson, attendance: facts.attendance.get(lesson.id) ?? null };
  }

  briefsOf(items: StudentAssignmentFact[], facts: StudentFacts): AssignmentBrief[] {
    const groupsById = new Map(facts.groups.map((group) => [group.id, group]));
    return items.flatMap((fact) => {
      const group = groupsById.get(fact.groupId);
      if (!group) return [];
      return [
        {
          id: fact.id,
          title: fact.title,
          type: fact.type,
          dueAt: fact.dueAt?.toISOString() ?? null,
          maxScore: fact.maxScore,
          group,
          submission: fact.submission
            ? {
                status: fact.submission.status,
                score: fact.submission.score,
                isLate: fact.submission.isLate,
                submittedAt: fact.submission.submittedAt?.toISOString() ?? null,
              }
            : null,
        },
      ];
    });
  }

  // ---------- показатели ----------

  /**
   * Занятия, которые идут в зачёт посещаемости: не отменены, уже начались и прошли после
   * зачисления ученика в группу (docs/04 §4.6).
   */
  countableLessons(
    facts: StudentFacts,
    now: Date,
    options: { groupId?: string; since?: Date } = {},
  ): LessonDto[] {
    return facts.lessons.filter((lesson) => {
      if (lesson.status === 'CANCELLED') return false;
      if (options.groupId && lesson.groupId !== options.groupId) return false;
      const startsAt = Date.parse(lesson.startsAt);
      if (startsAt > now.getTime()) return false;
      if (options.since && startsAt < options.since.getTime()) return false;
      const enrolledAt = facts.enrolledAt.get(lesson.groupId);
      return !enrolledAt || enrolledAt.getTime() <= startsAt;
    });
  }

  attendanceOf(
    facts: StudentFacts,
    now: Date,
    options: { groupId?: string; since?: Date } = {},
  ): { countable: number; attended: number; absences: number; lateCount: number } {
    const statuses = this.countableLessons(facts, now, options).map(
      (lesson) => facts.attendance.get(lesson.id) ?? null,
    );
    // Уважительные пропуски из знаменателя исключаются (docs/04 §4.6).
    return {
      countable: statuses.filter((status) => status !== 'EXCUSED').length,
      attended: statuses.filter((status) => status && ATTENDED.includes(status)).length,
      absences: statuses.filter((status) => status === 'ABSENT').length,
      lateCount: statuses.filter((status) => status === 'LATE').length,
    };
  }

  /** Знаменатель «выполнения»: срок внутри окна либо задание без срока, опубликованное в окне. */
  dueIn(
    facts: StudentFacts,
    from: Date,
    to: Date,
    groupId?: string,
  ): { due: number; doneOnTime: number; lateCount: number } {
    const inWindow = facts.assignments.filter((fact) => {
      if (groupId && fact.groupId !== groupId) return false;
      const at = fact.dueAt ?? fact.publishedAt;
      return !!at && at.getTime() >= from.getTime() && at.getTime() <= to.getTime();
    });
    return {
      due: inWindow.length,
      doneOnTime: inWindow.filter((fact) => isSubmitted(fact) && !fact.submission?.isLate).length,
      lateCount: inWindow.filter((fact) => fact.submission?.isLate).length,
    };
  }

  async stats(facts: StudentFacts, now: Date): Promise<StatsBrief> {
    const from = new Date(now.getTime() - STATS_DAYS * DAY_MS);
    const attendance = this.attendanceOf(facts, now);
    const completion = this.dueIn(facts, from, now);
    return {
      attendanceRate: attendanceRate(attendance.attended, attendance.countable),
      completionRate: completionRate(completion.doneOnTime, completion.due),
      activityScore: await this.activityOf(facts, now),
      absences: attendance.absences,
      lateCount: attendance.lateCount,
      period: {
        from: toDateOnly(facts.timezone, from),
        to: toDateOnly(facts.timezone, now),
      },
    };
  }

  /** «Активность» за неделю (docs/04 §4.6). */
  async activityOf(facts: StudentFacts, now: Date): Promise<number> {
    const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);
    const [blocksCompleted, tutorMessages] = await Promise.all([
      this.courses.countBlocksCompletedSince(facts.studentId, since),
      facts.userId
        ? this.ai.countTutorMessagesSince(facts.userId, facts.studentId, since)
        : Promise.resolve(0),
    ]);
    const submissions = facts.assignments.filter(
      (fact) =>
        fact.submission?.submittedAt && fact.submission.submittedAt.getTime() >= since.getTime(),
    ).length;
    const lessonsAttended = this.attendanceOf(facts, now, { since }).attended;
    // appOpens пока нет: события открытия приложения никто не пишет (ActivityEvent не заполняется).
    return activityScore({ blocksCompleted, submissions, lessonsAttended, tutorMessages });
  }

  clubs(facts: StudentFacts, now: Date): ClubProgress[] {
    const from = new Date(now.getTime() - STATS_DAYS * DAY_MS);
    return facts.groups.map((group) => {
      const attendance = this.attendanceOf(facts, now, { groupId: group.id });
      const completion = this.dueIn(facts, from, now, group.id);
      const rate = completionRate(completion.doneOnTime, completion.due);
      const percents = facts.progressByGroup.get(group.id) ?? [];
      // Нет курсов у кружка — прогрессом считается выполнение заданий (docs/04 §4.6).
      const percent = clubProgress(percents) ?? Math.round((rate ?? 0) * 100);
      return {
        club: group.club,
        group,
        percent,
        attendanceRate: attendanceRate(attendance.attended, attendance.countable),
        completionRate: rate,
      };
    });
  }

  /** Текущая неделя пн–вс: статус дня по занятиям ученика и отметкам. */
  week(facts: StudentFacts, now: Date): WeekDay[] {
    const monday = weekStart(facts.timezone, now);
    const today = toDateOnly(facts.timezone, now);
    return Array.from({ length: 7 }, (_, index) => {
      const dateOnly = toDateOnly(facts.timezone, addDays(monday, index));
      const dayLessons = facts.lessons.filter(
        (lesson) =>
          lesson.status !== 'CANCELLED' &&
          toDateOnly(facts.timezone, new Date(lesson.startsAt)) === dateOnly,
      );
      const statuses = dayLessons
        .map((lesson) => facts.attendance.get(lesson.id))
        .filter((status): status is AttendanceStatus => !!status);
      let status: WeekDay['status'];
      if (dateOnly === today) status = 'TODAY';
      else if (dayLessons.length === 0) status = 'NO_LESSONS';
      else if (dateOnly > today) status = 'UPCOMING';
      else if (statuses.some((s) => s === 'ABSENT' || s === 'EXCUSED')) status = 'MISSED';
      else if (statuses.length > 0) status = 'ATTENDED';
      // День с занятием, которое так и не отметили, не красим — данных о нём нет.
      else status = 'NO_LESSONS';
      return { date: dateOnly, status };
    });
  }

  gamification(facts: StudentFacts, now: Date): { streakDays: number; points: number } {
    const attendedLessons = this.countableLessons(facts, now).filter((lesson) => {
      const status = facts.attendance.get(lesson.id);
      return status && ATTENDED.includes(status);
    });
    const activeDays = [
      ...attendedLessons.map((lesson) =>
        toDateOnly(facts.timezone, new Date(lesson.startsAt)),
      ),
      ...facts.assignments.flatMap((fact) =>
        fact.submission?.submittedAt
          ? [toDateOnly(facts.timezone, fact.submission.submittedAt)]
          : [],
      ),
    ];
    return {
      streakDays: streakDays(activeDays, toDateOnly(facts.timezone, now)),
      points: coins(
        attendedLessons.length,
        facts.assignments.map((fact) => ({
          score: fact.submission?.score ?? null,
          maxScore: fact.maxScore,
        })),
      ),
    };
  }

  clubHomework(facts: StudentFacts, audience: HomeworkAudience, now: Date): ClubHomework[] {
    return facts.groups.map((group) => {
      const tasks = homeworkTasks(
        facts.assignments.filter((fact) => fact.groupId === group.id),
        audience,
        now,
      );
      return { club: group.club, group, counts: homeworkCounts(tasks), tasks };
    });
  }

  /** Динамика по неделям: те же метрики в окнах по 7 дней, от старой недели к текущей. */
  async weekly(facts: StudentFacts, now: Date): Promise<WeeklyPoint[]> {
    const monday = weekStart(facts.timezone, now);
    const points: WeeklyPoint[] = [];
    for (let back = WEEKLY_WEEKS - 1; back >= 0; back -= 1) {
      const from = addDays(monday, -7 * back);
      const to = back === 0 ? now : addDays(from, 7);
      const attendance = this.attendanceOf(facts, to, { since: from });
      const completion = this.dueIn(facts, from, to);
      points.push({
        weekStart: toDateOnly(facts.timezone, from),
        attendanceRate: attendanceRate(attendance.attended, attendance.countable),
        completionRate: completionRate(completion.doneOnTime, completion.due),
        activityScore: await this.activityOf(facts, to),
      });
    }
    return points;
  }
}
