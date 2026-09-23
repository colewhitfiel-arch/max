import { describe, expect, it } from 'vitest';
import { AttendanceSchema, CourseBlockSchema, SchoolSchema } from '../entities';
import {
  demoAttendance,
  demoBlocks,
  demoLessonSpecs,
  demoSchool,
  demoScheduleRules,
  materializeDemoAttendance,
  materializeDemoLessons,
  materializeDemoPaidPeriod,
  materializeDemoPayment,
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
});
