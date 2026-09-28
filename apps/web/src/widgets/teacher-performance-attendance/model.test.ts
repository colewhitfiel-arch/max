import type { TeacherGroupPerformance } from '@edu/contracts';
import { describe, expect, it } from 'vitest';
import { barLabel, courseTones } from './model';

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

describe('barLabel', () => {
  const group = (title: string, code: string | null, club: string) => ({
    title,
    code,
    club: { title: club },
  });

  it('код группы — как есть', () => {
    expect(barLabel(group('Робототехника, группа А', '001', 'Робототехника'))).toBe('001');
  });

  it('без кода — название без курса в начале: под столбцом мало места', () => {
    expect(barLabel(group('Робототехника, группа А', null, 'Робототехника'))).toBe('группа А');
    expect(barLabel(group('шахматы — младшие', null, 'Шахматы'))).toBe('младшие');
  });

  it('курс не в начале, не целым словом или всё название — название целиком', () => {
    expect(barLabel(group('Python, группа А', null, 'Программирование'))).toBe('Python, группа А');
    expect(barLabel(group('Робототехника, группа А', null, 'Робот'))).toBe(
      'Робототехника, группа А',
    );
    expect(barLabel(group('Шахматы', null, 'Шахматы'))).toBe('Шахматы');
  });
});
