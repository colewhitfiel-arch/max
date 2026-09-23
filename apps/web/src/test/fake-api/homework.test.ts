// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { homeworkStatus } from './homework';

const now = new Date('2026-09-21T12:00:00Z');
const graded = (score: number) => ({
  submittedAt: '2026-09-20T12:00:00Z',
  score,
  maxScore: 100,
  dueAt: '2026-09-20T20:59:00Z',
});

describe('homeworkStatus (docs/04 §4.6)', () => {
  it('родитель: красный — проверено меньше чем на 30%', () => {
    expect(homeworkStatus(graded(29), now)).toBe('FAILED');
    expect(homeworkStatus(graded(30), now)).toBe('DONE');
    expect(homeworkStatus(graded(75), now)).toBe('DONE');
  });

  it('преподаватель: порог как у родителя — красный меньше 30%', () => {
    expect(homeworkStatus(graded(29), now, 'teacher')).toBe('FAILED');
    expect(homeworkStatus(graded(30), now, 'teacher')).toBe('DONE');
    expect(homeworkStatus({ ...graded(0), score: null }, now, 'teacher')).toBe('DONE');
  });

  it('ученик: «правильно» — как у кристаллов, больше 75%', () => {
    expect(homeworkStatus(graded(75), now, 'student')).toBe('FAILED');
    expect(homeworkStatus(graded(76), now, 'student')).toBe('DONE');
    expect(homeworkStatus({ ...graded(0), score: null }, now, 'student')).toBe('DONE');
  });

  it('несданное — по дедлайну, одинаково для всех', () => {
    const open = { submittedAt: null, score: null, maxScore: 100 };
    for (const viewer of ['parent', 'teacher', 'student'] as const) {
      expect(homeworkStatus({ ...open, dueAt: '2026-09-20T12:00:00Z' }, now, viewer)).toBe(
        'FAILED',
      );
      expect(homeworkStatus({ ...open, dueAt: '2026-09-23T12:00:00Z' }, now, viewer)).toBe('SOON');
      expect(homeworkStatus({ ...open, dueAt: '2026-10-01T12:00:00Z' }, now, viewer)).toBe('LATER');
      expect(homeworkStatus({ ...open, dueAt: null }, now, viewer)).toBe('LATER');
    }
  });
});
