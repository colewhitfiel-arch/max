import { Inject, Injectable } from '@nestjs/common';
import { type StudentContext, serializeStudentContext } from '@edu/ai';
import type { TrajectoryContent } from '@edu/contracts';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiRepository } from './ai.repository';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAY_MS = 86_400_000;
export const CONTEXT_TTL_SEC = 300;

export interface StudentContextBundle {
  studentId: string;
  userId: string;
  schoolId: string | null;
  context: StudentContext;
  /** Сериализованный текст для промпта. */
  text: string;
  /**
   * Имя из профиля без ника — так ребёнка называет тьютор родителя (в `context` — ник, если есть).
   * Может отсутствовать в кэше, собранном до появления поля.
   */
  firstName?: string;
}

/**
 * Сборщик сжатого снимка ученика для модели (docs/02 §2.6, docs/06 §6.3). Кэш 5 мин в KV,
 * инвалидация по событиям (ai.events.ts). PII минимизируется: имя/ник, без фамилий и контактов.
 *
 * Пока модули analytics/groups/courses не опубликовали read-сервисы (workstreams A/E/B/H),
 * снимок собирается прямыми чтениями Prisma — единственное место таких чтений в модуле ai.
 */
@Injectable()
export class StudentContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AiRepository,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
  ) {}

  private key(studentId: string): string {
    return `ai:ctx:${studentId}`;
  }

  async invalidate(studentId: string): Promise<void> {
    await this.kv.del(this.key(studentId));
  }

  async get(
    studentId: string,
    options: { fresh?: boolean } = {},
  ): Promise<StudentContextBundle | null> {
    if (!options.fresh) {
      const cached = await this.kv.get<StudentContextBundle>(this.key(studentId));
      if (cached) return cached;
    }
    const bundle = await this.build(studentId);
    if (bundle) await this.kv.set(this.key(studentId), bundle, CONTEXT_TTL_SEC);
    return bundle;
  }

  async build(studentId: string): Promise<StudentContextBundle | null> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, nickname: true } },
        school: { select: { timezone: true } },
      },
    });
    if (!student) return null;

    const now = new Date();
    const from30 = new Date(now.getTime() - 30 * DAY_MS);
    const in7 = new Date(now.getTime() + 7 * DAY_MS);
    const timezone = student.school?.timezone ?? 'Europe/Moscow';

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: { in: ['ACTIVE', 'PAUSED'] } },
      include: {
        group: {
          include: {
            club: { select: { title: true, category: true } },
            teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
            scheduleRules: { where: { validTo: null }, orderBy: { weekday: 'asc' } },
          },
        },
      },
    });
    const groupIds = enrollments.map((e) => e.groupId);
    const enrolledAtByGroup = new Map(enrollments.map((e) => [e.groupId, e.enrolledAt]));

    const [
      upcoming,
      doneLessons,
      assignments,
      progressRows,
      blocksCompleted,
      tutorMessages,
      trajectory,
      laterClubs,
    ] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { groupId: { in: groupIds }, status: 'PLANNED', startsAt: { gte: now, lt: in7 } },
        orderBy: { startsAt: 'asc' },
        take: 10,
        include: { group: { select: { club: { select: { title: true } } } } },
      }),
      this.prisma.lesson.findMany({
        where: { groupId: { in: groupIds }, status: 'DONE', startsAt: { gte: from30, lte: now } },
        include: { attendance: { where: { studentId }, select: { status: true } } },
      }),
      this.prisma.assignment.findMany({
        where: { groupId: { in: groupIds }, publishedAt: { not: null }, deletedAt: null },
        include: {
          submissions: { where: { studentId } },
          group: { select: { club: { select: { title: true } } } },
        },
      }),
      this.prisma.courseProgress.findMany({
        where: { studentId },
        include: { course: { select: { title: true, groupId: true, status: true } } },
      }),
      this.prisma.blockProgress.count({
        where: { studentId, status: 'COMPLETED', completedAt: { gte: from30 } },
      }),
      this.repo.countUserMessagesSince(student.userId, studentId, from30),
      this.repo.latestTrajectory(studentId),
      this.repo.listClubInterests(studentId, 'LATER'),
    ]);

    // Посещаемость: DONE-занятия периода, на которые ученик был зачислен, минус EXCUSED
    const attendanceByGroup = new Map<string, { attended: number; countable: number }>();
    let attended = 0;
    let countable = 0;
    let absences = 0;
    let lateCount = 0;
    for (const lesson of doneLessons) {
      const enrolledAt = enrolledAtByGroup.get(lesson.groupId);
      if (!enrolledAt || enrolledAt > lesson.startsAt) continue;
      const status = lesson.attendance[0]?.status;
      if (status === 'EXCUSED') continue;
      const bucket = attendanceByGroup.get(lesson.groupId) ?? { attended: 0, countable: 0 };
      bucket.countable += 1;
      countable += 1;
      if (status === 'PRESENT' || status === 'LATE') {
        bucket.attended += 1;
        attended += 1;
      }
      if (status === 'ABSENT') absences += 1;
      if (status === 'LATE') lateCount += 1;
      attendanceByGroup.set(lesson.groupId, bucket);
    }

    // Задания
    const isDone = (status: string | undefined) => status === 'SUBMITTED' || status === 'GRADED';
    let due = 0;
    let doneOnTime = 0;
    let submissions30 = 0;
    const open: StudentContext['openAssignments'] = [];
    const results: StudentContext['recentResults'] = [];
    for (const a of assignments) {
      const submission = a.submissions[0];
      const inPeriod = a.dueAt
        ? a.dueAt >= from30 && a.dueAt <= now
        : !!a.publishedAt && a.publishedAt >= from30;
      if (inPeriod) {
        due += 1;
        if (isDone(submission?.status) && !submission?.isLate) doneOnTime += 1;
      }
      if (submission?.submittedAt && submission.submittedAt >= from30) submissions30 += 1;
      if (!isDone(submission?.status)) {
        open.push({
          title: a.title,
          club: a.group.club.title,
          type: a.type,
          status: submission?.status ?? 'NOT_STARTED',
          ...(a.dueAt ? { dueAt: a.dueAt.toISOString() } : {}),
        });
      }
      if (submission?.status === 'GRADED' && submission.score !== null && submission.gradedAt) {
        results.push({
          title: a.title,
          club: a.group.club.title,
          score: submission.score,
          maxScore: a.maxScore,
          isLate: submission.isLate,
          at: submission.gradedAt.toISOString(),
        });
      }
    }
    open.sort((x, y) => (x.dueAt ?? '9').localeCompare(y.dueAt ?? '9'));
    results.sort((x, y) => y.at.localeCompare(x.at));

    const progressByGroup = new Map<string, number[]>();
    for (const row of progressRows) {
      if (row.course.status !== 'PUBLISHED') continue;
      const list = progressByGroup.get(row.course.groupId) ?? [];
      list.push(row.percent);
      progressByGroup.set(row.course.groupId, list);
    }

    const context: StudentContext = {
      student: {
        name: student.user.nickname ?? student.user.firstName,
        ...(student.classLabel ? { classLabel: student.classLabel } : {}),
        interests: student.interests,
        goals: student.goals,
        ...(student.weeklyHours !== null ? { weeklyHours: student.weeklyHours } : {}),
        preferredFormats: student.preferredFormats,
        ...(student.futureInterests.length > 0 ? { futureInterests: student.futureInterests } : {}),
        ...(student.aiProfileSummary ? { aiProfileSummary: student.aiProfileSummary } : {}),
      },
      ...(laterClubs.length > 0
        ? {
            laterClubs: laterClubs.map((row) => ({
              title: row.club.title,
              ...(row.reason ? { reason: row.reason } : {}),
            })),
          }
        : {}),
      clubs: enrollments.map((e) => {
        const rate = attendanceByGroup.get(e.groupId);
        const percents = progressByGroup.get(e.groupId) ?? [];
        return {
          title: e.group.club.title,
          category: e.group.club.category,
          teacherName: e.group.teacher.user.firstName,
          scheduleText:
            e.group.scheduleRules
              .map((r) => `${WEEKDAYS[r.weekday]} ${r.startTime}–${r.endTime}`)
              .join(', ') || 'не задано',
          progressPercent: percents.length
            ? Math.round(percents.reduce((s, v) => s + v, 0) / percents.length)
            : 0,
          attendanceRate: rate && rate.countable > 0 ? rate.attended / rate.countable : null,
        };
      }),
      upcomingLessons: upcoming.map((l) => ({
        club: l.group.club.title,
        startsAt: l.startsAt.toISOString(),
        ...(l.topic ? { topic: l.topic } : {}),
      })),
      // Весь список: сериализатор сам покажет первые maxItems, а в заголовке — настоящее число и
      // «…и ещё N» (на это число опирается ответ родителю «Какие задания просрочены?»).
      openAssignments: open,
      recentResults: results.slice(0, 10),
      stats30d: {
        attendanceRate: countable > 0 ? attended / countable : null,
        completionRate: due > 0 ? doneOnTime / due : null,
        activityScore: Math.min(
          100,
          10 * blocksCompleted + 15 * submissions30 + 5 * attended + 2 * tutorMessages,
        ),
        absences,
        lateCount,
      },
      courseProgress: progressRows
        .filter((r) => r.course.status === 'PUBLISHED')
        .map((r) => ({ course: r.course.title, percent: r.percent })),
      ...(trajectory
        ? {
            trajectory: {
              summary: (trajectory.content as TrajectoryContent).summary,
              nextSteps: (trajectory.content as TrajectoryContent).nextSteps,
            },
          }
        : {}),
      now: now.toISOString(),
      timezone,
    };

    return {
      studentId,
      userId: student.userId,
      schoolId: student.schoolId,
      context,
      text: serializeStudentContext(context),
      firstName: student.user.firstName,
    };
  }
}
