import type { TeacherGroupPerformance } from '@edu/contracts';
import { describe, expect, it } from 'vitest';
import { courseTones } from './model';

const row = (groupId: string, clubId: string) =>
  ({
    group: { id: groupId, title: groupId, club: { id: clubId, title: clubId } },
  }) as unknown as TeacherGroupPerformance;

describe('courseTones', () => {
  it('даёт курсу цвет по порядку первого появления, группы одного курса — один цвет', () => {
    const tones = courseTones([
      row('g1', 'robotics'),
      row('g2', 'chinese'),
      row('g3', 'robotics'),
      row('g4', 'chess'),
      row('g5', 'math'),
      row('g6', 'english'),
    ]);
    expect(tones.map(({ club, tone }) => [club.id, tone])).toEqual([
      ['robotics', 'primary'],
      ['chinese', 'success'],
      ['chess', 'info'],
      ['math', 'danger'],
      // Дальше по кругу.
      ['english', 'primary'],
    ]);
  });

  it('без групп — без курсов', () => {
    expect(courseTones([])).toEqual([]);
  });
});
