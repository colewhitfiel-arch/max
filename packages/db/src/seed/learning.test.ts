/**
 * Чистые хелперы seed'а learning — без БД.
 */
import { demoAttendance, demoBlocks, materializeDemoLessons } from '@edu/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { demoAttendanceRows, demoCourseProgressData } from './learning';

describe('seed learning', () => {
  const now = new Date('2026-09-23T09:00:00.000Z');

  it('отметка посещаемости не раньше начала занятия', () => {
    const lessons = new Map(materializeDemoLessons(now).map((lesson) => [lesson.id, lesson]));
    const rows = demoAttendanceRows(now);
    expect(rows).toHaveLength(demoAttendance.length);
    for (const row of rows) {
      const lesson = lessons.get(row.lessonId);
      expect(lesson).toBeDefined();
      expect(Date.parse(row.markedAt)).toBeGreaterThanOrEqual(Date.parse(lesson?.startsAt ?? ''));
    }
  });

  it('прогресс по курсу одинаков для create и update: percent считается от числа блоков', () => {
    const data = demoCourseProgressData(now);
    expect(data.totalBlocks).toBe(demoBlocks.length);
    expect(data.percent).toBe(Math.round((data.completedBlocks / demoBlocks.length) * 100));
  });
});
