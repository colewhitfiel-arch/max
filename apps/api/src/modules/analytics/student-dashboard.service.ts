import { Injectable } from '@nestjs/common';
import type { ClubProgress, StudentHomeDto, StudentProfileDto } from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { dayBounds } from '../../common/time/time';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';
import { sumHomeworkCounts } from './homework';
import { DAY_MS, UPCOMING_DAYS, StudentFactsService, isSubmitted } from './student-facts.service';

/** Сколько занятий и заданий показывать в списках главной (контракт). */
const LIST_LIMIT = 10;

/**
 * Главная и профиль ученика (docs/07 F1, F5). Цифры считает `StudentFactsService` — те же,
 * что видят родитель и преподаватель.
 */
@Injectable()
export class StudentDashboardService {
  constructor(
    private readonly facts: StudentFactsService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
  ) {}

  async getHome(user: AuthUser): Promise<StudentHomeDto> {
    const facts = await this.facts.collect(requireStudent(user), user.userId);
    const now = new Date();
    const { start, end } = dayBounds(facts.timezone, now);
    const lessons = facts.lessons.map((lesson) => this.facts.withAttendance(lesson, facts));
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

    return {
      today,
      upcoming,
      tasks: this.facts.briefsOf(open, facts),
      stats: await this.facts.stats(facts, now),
      clubs: this.facts.clubs(facts, now),
      // Комментарий ИИ на главной появится вместе с инсайтами (AiInsight, workstream C).
      aiComment: null,
      week: this.facts.week(facts, now),
      ...this.facts.gamification(facts, now),
    };
  }

  async getProfile(user: AuthUser): Promise<StudentProfileDto> {
    const studentId = requireStudent(user);
    const [facts, profile] = await Promise.all([
      this.facts.collect(studentId, user.userId),
      this.identity.getStudentProfile(studentId),
    ]);
    if (!profile) throw Errors.notFound('Профиль ученика');
    const now = new Date();
    // У ученика «правильно» — как у кристаллов: больше 75% (docs/04 §4.6).
    const clubHomework = this.facts.clubHomework(facts, 'STUDENT', now);
    return {
      user: profile.user,
      classLabel: profile.classLabel,
      school: profile.schoolId ? await this.school.getBrief(profile.schoolId) : null,
      clubs: this.facts.clubs(facts, now),
      stats: await this.facts.stats(facts, now),
      interests: profile.interests,
      goals: profile.goals,
      ...this.facts.gamification(facts, now),
      week: this.facts.week(facts, now),
      homework: sumHomeworkCounts(clubHomework.map((item) => item.counts)),
      clubHomework,
    };
  }

  /** Публичный сервис: прогресс по кружкам ученика — кружки ребёнка у родителя. */
  async clubProgressOf(studentId: string, userId: string): Promise<ClubProgress[]> {
    return this.facts.clubs(await this.facts.collect(studentId, userId), new Date());
  }
}

function requireStudent(user: AuthUser): string {
  if (user.activeRole !== 'STUDENT' || !user.profileId) throw Errors.forbidden('Только для ученика');
  return user.profileId;
}
