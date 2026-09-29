import { CLUB_CATEGORIES } from '@edu/contracts';
import { describe, expect, it } from 'vitest';
import { clubIcon, type ClubIconSet } from './icons';

const SETS: ClubIconSet[] = ['student', 'parent', 'planet'];

describe('иконки кружков', () => {
  it.each(SETS)('%s: у каждого из 8 кружков своя, неповторяющаяся иконка', (set) => {
    const icons = CLUB_CATEGORIES.map((category) => clubIcon(category, set));
    for (const icon of icons) expect(icon).toBeTruthy();
    expect(new Set(icons).size).toBe(CLUB_CATEGORIES.length);
  });

  it('по умолчанию — синий набор (ученик и преподаватель)', () => {
    expect(clubIcon('CHINESE')).toBe(clubIcon('CHINESE', 'student'));
    expect(clubIcon('CHINESE', 'parent')).not.toBe(clubIcon('CHINESE', 'student'));
  });
});
