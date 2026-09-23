import { Injectable } from '@nestjs/common';
import type {
  AssignmentBrief,
  AttendanceStatus,
  ClubHomework,
  ClubProgress,
  GroupBrief,
  LessonDto,
  StatsBrief,
  StudentHomeDto,
  StudentProfileDto,
  WeekDay,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { addDays, dayBounds, toDateOnly, weekStart } from '../../common/time/time';
import { AiActivityService } from '../ai/ai-activity.service';
import { type StudentAssignmentFact, AssignmentsService } from '../assignments/assignments.service';
import { AttendanceService } from '../attendance/attendance.service';
import { CoursesService } from '../courses/courses.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';
import { coins, streakDays } from './gamification';
import { homeworkCounts, homeworkTasks, sumHomeworkCounts } from './homework';
import { activityScore, attendanceRate, clubProgress, completionRate } from './metrics';

const DAY_MS = 86_400_000;
/** Окно показателей по умолчанию (docs/04 §4.6). */
const STATS_DAYS = 30;
/** Окно «активности» (docs/04 §4.6 — неделя). */
const ACTIVITY_DAYS = 7;
/** Насколько вперёд смотрит блок «Ближайшие занятия». */
const UPCOMING_DAYS = 7;
/** Сколько занятий и заданий показывать в списках главной (контракт). */
const LIST_LIMIT = 10;

const ATTENDED: AttendanceStatus[] = ['PRESENT', 'LATE'];

const isSubmitted = (fact: StudentAssignmentFact) =>
  fact.submission?.status === 'SUBMITTED' || fact.submission?.status === 'GRADED';

/** Факты одного ученика, из которых считаются все цифры экранов. */
interface StudentFacts {
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
 * Главная и профиль ученика (docs/07 F1, F5): показатели, кружки, серия, кристаллы, неделя
 * посещений и сетки заданий. Формулы — только из `metrics.ts`, `gamification.ts` и `homework.ts`;
 * данные приносят публичные сервисы своих модулей (AGENT_GUIDE §4–5).
 */
@Injectable()
export class StudentDashboardService {
  constructor(
    private readonly groups: GroupsService,
    private readonly attendance: AttendanceService,
    private readonly assignments: AssignmentsService,
    private readonly courses: CoursesService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
    private readonly ai: AiActivityService,
  ) {}

  async getHome(user: AuthUser): Promise<StudentHomeDto> {
    const facts = await this.collect(user);
    const now = new Date();
    const { start, end } = dayBounds(facts.timezone, now);
    const lessons = facts.lessons.map((lesson) => this.withAttendance(lesson, facts));
    const today = lessons.filter(
      (lesson) =>
        Date.parse(lesson.startsAt) >= start.getTime() &&
        Date.parse(lesson.startsAt) < end.getTime(),
    );
    const upcoming = lessons
      .filter(
        (lesson) =>
          Date.parse(lesson.startsAt) >= end.getTime() &&
          Date.parse(lesson.startsAt) <= now.getTime() + UPCOMING_DAYS * DAY_MS &&
          lesson.status !== 'CANCELLED',
      )
      .slice(0, LIST_LIMIT);

    const open = facts.assignments
      .filter((fact) => !isSubmitted(fact))
      .sort(
        (a, b) =>
          (a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, LIST_LIMIT);
    const tasks = this.briefsOf(open, facts);

    return {
      today,
      upcoming,
      tasks,
      stats: await this.stats(facts, now),
      clubs: this.clubs(facts, now),
      // Комментарий ИИ на главной появится вместе с инсайтами (AiInsight, workstream C).
      aiComment: null,
      week: this.week(facts, now),
      ...this.gamification(facts, now),
    };
  }

  async getProfile(user: AuthUser): Promise<StudentProfileDto> {
    const studentId = requireStudent(user);
    const [facts, profile] = await Promise.all([
      this.collect(user),
      this.identity.getStudentProfile(studentId),
    ]);
    if (!profile) throw Errors.notFound('Профиль ученика');
    const now = new Date();
    const clubHomework = this.clubHomework(facts, now);
    return {
      user: profile.user,
      classLabel: profile.classLabel,
      school: profile.schoolId ? await this.school.getBrief(profile.schoolId) : null,
      clubs: this.clubs(facts, now),
      stats: await this.stats(facts, now),
      interests: profile.interests,
      goals: profile.goals,
      ...this.gamification(facts, now),
      week: this.week(facts, now),
      homework: sumHomeworkCounts(clubHomework.map((item) => item.counts)),
      clubHomework,
    };
  }

  // ---------- сбор фактов ----------

  private async collect(user: AuthUser): Promise<StudentFacts> {
    const studentId = requireStudent(user);
    const profile = await this.identity.getStudentProfile(studentId);
    const timezone = profile?.schoolId
      ? await this.school.timezone(profile.schoolId)
      : 'Europe/Moscow';
    const [groups, enrollments] = await Promise.all([
      this.groups.listGroupBriefsOfStudent(studentId),
      this.groups.listEnrollmentsOfStudent(studentId),
    ]);
    const groupIds = groups.map((group) => group.id);
    const now = new Date();
    const lessons = await this.groups.listLessons(
      groupIds,
      new Date(now.getTime() - STATS_DAYS * DAY_MS),
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
      userId: user.userId,
      timezone,
      groups,
      enrolledAt: new Map(enrollments.map((row) => [row.groupId, row.enrolledAt])),
      lessons,
      attendance,
      assignments,
      progressByGroup,
    };
  }

  private withAttendance(lesson: LessonDto, facts: StudentFacts): LessonDto {
    return { ...lesson, attendance: facts.attendance.get(lesson.id) ?? null };
  }

  private briefsOf(facts: StudentAssignmentFact[], all: StudentFacts): AssignmentBrief[] {
    const groupsById = new Map(all.groups.map((group) => [group.id, group]));
    return facts.flatMap((fact) => {
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
  private countableLessons(facts: StudentFacts, now: Date, groupId?: string): LessonDto[] {
    return facts.lessons.filter((lesson) => {
      if (lesson.status === 'CANCELLED') return false;
      if (groupId && lesson.groupId !== groupId) return false;
      const startsAt = Date.parse(lesson.startsAt);
      if (startsAt > now.getTime()) return false;
      const enrolledAt = facts.enrolledAt.get(lesson.groupId);
      return !enrolledAt || enrolledAt.getTime() <= startsAt;
    });
  }

  private attendanceOf(facts: StudentFacts, now: Date, groupId?: string) {
    const statuses = this.countableLessons(facts, now, groupId).map(
      (lesson) => facts.attendance.get(lesson.id) ?? null,
    );
    // Уважительные пропуски из знаменателя исключаются (docs/04 §4.6).
    const countable = statuses.filter((status) => status !== 'EXCUSED').length;
    return {
      countable,
      attended: statuses.filter((status) => status && ATTENDED.includes(status)).length,
      absences: statuses.filter((status) => status === 'ABSENT').length,
      lateCount: statuses.filter((status) => status === 'LATE').length,
    };
  }

  /** Знаменатель «выполнения»: срок внутри окна либо задание без срока, опубликованное в окне. */
  private dueIn(facts: StudentFacts, from: Date, now: Date, groupId?: string) {
    const inWindow = facts.assignments.filter((fact) => {
      if (groupId && fact.groupId !== groupId) return false;
      const at = fact.dueAt ?? fact.publishedAt;
      return !!at && at.getTime() >= from.getTime() && at.getTime() <= now.getTime();
    });
    return {
      due: inWindow.length,
      doneOnTime: inWindow.filter((fact) => isSubmitted(fact) && !fact.submission?.isLate).length,
    };
  }

  private async stats(facts: StudentFacts, now: Date): Promise<StatsBrief> {
    const from = new Date(now.getTime() - STATS_DAYS * DAY_MS);
    const attendance = this.attendanceOf(facts, now);
    const completion = this.dueIn(facts, from, now);
    const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);
    const [blocksCompleted, tutorMessages] = await Promise.all([
      this.courses.countBlocksCompletedSince(facts.studentId, since),
      this.ai.countTutorMessagesSince(facts.userId, facts.studentId, since),
    ]);
    const submissions = facts.assignments.filter(
      (fact) =>
        fact.submission?.submittedAt && fact.submission.submittedAt.getTime() >= since.getTime(),
    ).length;
    const lessonsAttended = this.countableLessons(facts, since, undefined).filter((lesson) => {
      const status = facts.attendance.get(lesson.id);
      return Date.parse(lesson.startsAt) >= since.getTime() && status && ATTENDED.includes(status);
    }).length;
    return {
      attendanceRate: attendanceRate(attendance.attended, attendance.countable),
      completionRate: completionRate(completion.doneOnTime, completion.due),
      // appOpens пока нет: события открытия приложения никто не пишет (ActivityEvent не заполняется).
      activityScore: activityScore({ blocksCompleted, submissions, lessonsAttended, tutorMessages }),
      absences: attendance.absences,
      lateCount: attendance.lateCount,
      period: {
        from: toDateOnly(facts.timezone, from),
        to: toDateOnly(facts.timezone, now),
      },
    };
  }

  private clubs(facts: StudentFacts, now: Date): ClubProgress[] {
    const from = new Date(now.getTime() - STATS_DAYS * DAY_MS);
    return facts.groups.map((group) => {
      const attendance = this.attendanceOf(facts, now, group.id);
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
  private week(facts: StudentFacts, now: Date): WeekDay[] {
    const monday = weekStart(facts.timezone, now);
    const today = toDateOnly(facts.timezone, now);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      const dateOnly = toDateOnly(facts.timezone, date);
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

  private gamification(facts: StudentFacts, now: Date): { streakDays: number; points: number } {
    const activeDays = [
      ...this.countableLessons(facts, now)
        .filter((lesson) => {
          const status = facts.attendance.get(lesson.id);
          return status && ATTENDED.includes(status);
        })
        .map((lesson) => toDateOnly(facts.timezone, new Date(lesson.startsAt))),
      ...facts.assignments.flatMap((fact) =>
        fact.submission?.submittedAt
          ? [toDateOnly(facts.timezone, fact.submission.submittedAt)]
          : [],
      ),
    ];
    const attended = this.countableLessons(facts, now).filter((lesson) => {
      const status = facts.attendance.get(lesson.id);
      return status && ATTENDED.includes(status);
    }).length;
    return {
      streakDays: streakDays(activeDays, toDateOnly(facts.timezone, now)),
      points: coins(
        attended,
        facts.assignments.map((fact) => ({
          score: fact.submission?.score ?? null,
          maxScore: fact.maxScore,
        })),
      ),
    };
  }

  private clubHomework(facts: StudentFacts, now: Date): ClubHomework[] {
    return facts.groups.map((group) => {
      const tasks = homeworkTasks(
        facts.assignments.filter((fact) => fact.groupId === group.id),
        'STUDENT',
        now,
      );
      return { club: group.club, group, counts: homeworkCounts(tasks), tasks };
    });
  }
}

function requireStudent(user: AuthUser): string {
  if (user.activeRole !== 'STUDENT' || !user.profileId) throw Errors.forbidden('Только для ученика');
  return user.profileId;
}
