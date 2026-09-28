import { describe, expect, it } from 'vitest';
import {
  AttendanceSchema,
  CourseBlockSchema,
  NotificationSchema,
  SchoolSchema,
  SubmissionSchema,
} from '../entities';
import {
  DEMO_IDS,
  demoAssignmentDueOffsets,
  demoAttendance,
  demoBlocks,
  demoClubInterests,
  demoClubs,
  demoEnrollments,
  demoGroups,
  demoLessonSpecs,
  demoSchool,
  demoScheduleRules,
  demoStudents,
  demoSubmissions,
  demoUsers,
  materializeDemoAttendance,
  materializeDemoLessons,
  materializeDemoPaidPeriod,
  materializeDemoPayment,
  materializeDemoRoleNotifications,
  materializeDemoSubmissions,
  materializeDemoWalletIncome,
  materializeLessons,
} from './index';

const DAY_MS = 86_400_000;
const MSK = 180;
/** Разные «сейчас»: день, ночь по МСК (UTC ещё вчера) и другой день недели. */
const NOWS = [
  new Date('2026-09-23T09:00:00.000Z'),
  new Date('2026-09-23T22:30:00.000Z'),
  new Date('2026-11-02T12:00:00.000Z'),
];

/** Дата `YYYY-MM-DD` по часам школы. */
const schoolDate = (iso: string, tz = MSK) =>
  new Date(Date.parse(iso) + tz * 60_000).toISOString().slice(0, 10);

describe('демо-мир', () => {
  it('блоки и школа проходят схемы контракта', () => {
    for (const block of demoBlocks) expect(CourseBlockSchema.safeParse(block).success).toBe(true);
    expect(SchoolSchema.safeParse(demoSchool).success).toBe(true);
  });

  it('materializeDemoLessons — обёртка над materializeLessons', () => {
    for (const now of NOWS) {
      expect(materializeDemoLessons(now, MSK)).toEqual(
        materializeLessons(demoLessonSpecs, now, MSK),
      );
    }
  });

  it('занятие с ruleId приходится на день недели своего правила', () => {
    for (const now of NOWS) {
      for (const lesson of materializeDemoLessons(now, MSK)) {
        if (!lesson.ruleId) continue;
        const rule = demoScheduleRules.find((r) => r.id === lesson.ruleId);
        expect(rule, lesson.id).toBeDefined();
        const weekday = new Date(Date.parse(lesson.startsAt) + MSK * 60_000).getUTCDay();
        expect(weekday, lesson.id).toBe(rule?.weekday);
      }
    }
  });

  it('отметка посещаемости — в начале занятия, не раньше него', () => {
    for (const now of NOWS) {
      const lessons = new Map(materializeDemoLessons(now, MSK).map((l) => [l.id, l]));
      const attendance = materializeDemoAttendance(now, MSK);
      expect(attendance).toHaveLength(demoAttendance.length);
      for (const row of attendance) {
        expect(AttendanceSchema.safeParse(row).success).toBe(true);
        expect(row.markedAt).toBe(lessons.get(row.lessonId)?.startsAt);
        expect(Date.parse(row.markedAt)).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it('оплата и оплаченный период — относительно now: оплачено в прошлом, период ещё идёт', () => {
    for (const now of NOWS) {
      const payment = materializeDemoPayment(now, MSK);
      const period = materializeDemoPaidPeriod(now, MSK);
      expect(Date.parse(payment.paidAt ?? '')).toBeLessThan(now.getTime());
      expect(payment.createdAt).toBe(payment.paidAt);
      expect(period.paymentId).toBe(payment.id);
      expect(period.enrollmentId).toBe(payment.enrollmentId);
      expect(period.periodStart).toBe(schoolDate(payment.paidAt ?? ''));
      const days = (Date.parse(period.periodEnd) - Date.parse(period.periodStart)) / DAY_MS;
      expect(days).toBe(29);
      expect(period.periodEnd >= schoolDate(now.toISOString())).toBe(true);
    }
  });

  it('сдачи — относительно now: сданы до срока задания, проверены позже сдачи, всё в прошлом', () => {
    for (const now of NOWS) {
      const submissions = materializeDemoSubmissions(now, MSK);
      expect(submissions).toHaveLength(demoSubmissions.length);
      for (const row of submissions) {
        expect(SubmissionSchema.safeParse(row).success).toBe(true);
        const submittedAt = Date.parse(row.submittedAt ?? '');
        expect(submittedAt).toBeLessThan(now.getTime());
        expect(Date.parse(row.gradedAt ?? '')).toBeGreaterThan(submittedAt);
        expect(Date.parse(row.gradedAt ?? '')).toBeLessThanOrEqual(now.getTime());
        const dueOffset = demoAssignmentDueOffsets[row.assignmentId];
        if (dueOffset !== undefined)
          expect(submittedAt).toBeLessThanOrEqual(now.getTime() + dueOffset * DAY_MS);
      }
    }
  });

  it('у Python есть прошедшее занятие с отметкой, серия Алексея жива (действие ≤ 2 дней назад)', () => {
    for (const now of NOWS) {
      const lessons = new Map(materializeDemoLessons(now, MSK).map((l) => [l.id, l]));
      const attended = materializeDemoAttendance(now, MSK).filter(
        (row) =>
          row.studentId === DEMO_IDS.students.alexey && ['PRESENT', 'LATE'].includes(row.status),
      );
      const python = attended.filter(
        (row) => lessons.get(row.lessonId)?.groupId === DEMO_IDS.groups.programmingA,
      );
      expect(python.length).toBeGreaterThan(0);
      for (const row of python) expect(lessons.get(row.lessonId)?.status).toBe('DONE');

      const actionDays = [
        ...attended.map((row) => schoolDate(lessons.get(row.lessonId)?.startsAt ?? '')),
        ...materializeDemoSubmissions(now, MSK)
          .filter((row) => row.studentId === DEMO_IDS.students.alexey && row.submittedAt)
          .map((row) => schoolDate(row.submittedAt ?? '')),
      ].sort();
      const today = schoolDate(now.toISOString());
      const daysSinceLast = (Date.parse(today) - Date.parse(actionDays.at(-1) ?? '')) / DAY_MS;
      expect(daysSinceLast).toBeGreaterThanOrEqual(0);
      expect(daysSinceLast).toBeLessThanOrEqual(2);
    }
  });

  it('поступление в кошелёк — от демо-оплаты преподавателю группы, на ту же сумму', () => {
    for (const now of NOWS) {
      const payment = materializeDemoPayment(now, MSK);
      const income = materializeDemoWalletIncome(now, MSK);
      const enrollment = demoEnrollments.find((e) => e.id === payment.enrollmentId);
      const group = demoGroups.find((g) => g.id === enrollment?.groupId);
      expect(income).toMatchObject({
        kind: 'INCOME',
        amount: payment.amount,
        paymentId: payment.id,
        studentId: payment.studentId,
        groupId: group?.id,
        teacherId: group?.teacherId,
        at: payment.paidAt,
      });
    }
  });

  it('уведомления родителя и преподавателя проходят схему и не из будущего', () => {
    for (const now of NOWS) {
      const notifications = materializeDemoRoleNotifications(now, MSK);
      expect(notifications.map((n) => n.userId).sort()).toEqual(
        [demoUsers.parent.id, demoUsers.teacher.id].sort(),
      );
      for (const { userId: _userId, ...notification } of notifications) {
        expect(NotificationSchema.safeParse(notification).success).toBe(true);
        expect(Date.parse(notification.createdAt)).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it('спрос на кружки — у прошедшего онбординг ученика, по существующим кружкам, без дублей', () => {
    const clubIds = new Set(demoClubs.map((club) => club.id));
    const pairs = new Set(demoClubInterests.map((row) => `${row.studentId}:${row.clubId}`));
    expect(pairs.size).toBe(demoClubInterests.length);
    for (const row of demoClubInterests) {
      expect(clubIds.has(row.clubId)).toBe(true);
      const student = demoStudents.find((s) => s.id === row.studentId);
      expect(student?.onboardingCompletedAt).not.toBeNull();
    }
    expect(demoClubInterests.length).toBeGreaterThan(0);
  });
});
