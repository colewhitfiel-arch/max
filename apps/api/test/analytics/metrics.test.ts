import { describe, expect, it } from 'vitest';
import {
  activityScore,
  attendanceRate,
  clubProgress,
  completionRate,
} from '../../src/modules/analytics/metrics';

describe('analytics metrics (docs/04)', () => {
  it('доли: деление на ноль → null', () => {
    expect(attendanceRate(3, 4)).toBe(0.75);
    expect(attendanceRate(0, 0)).toBeNull();
    expect(completionRate(1, 2)).toBe(0.5);
    expect(completionRate(0, 0)).toBeNull();
  });

  it('активность ограничена 100', () => {
    expect(
      activityScore({ blocksCompleted: 1, submissions: 1, lessonsAttended: 1, tutorMessages: 1 }),
    ).toBe(32);
    expect(
      activityScore({
        blocksCompleted: 1,
        submissions: 0,
        lessonsAttended: 0,
        tutorMessages: 0,
        appOpens: 3,
      }),
    ).toBe(13);
    expect(
      activityScore({ blocksCompleted: 20, submissions: 0, lessonsAttended: 0, tutorMessages: 0 }),
    ).toBe(100);
  });

  it('прогресс по кружку — округлённое среднее, без курсов → null', () => {
    expect(clubProgress([10, 21])).toBe(16);
    expect(clubProgress([])).toBeNull();
  });
});
