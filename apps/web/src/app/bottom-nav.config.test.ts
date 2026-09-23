import { describe, expect, it } from 'vitest';
import { activeNavKey, BOTTOM_NAV } from './bottom-nav.config';

describe('activeNavKey', () => {
  const teacher = BOTTOM_NAV.TEACHER;

  it('меню репетитора: главная · задания · успеваемость (центр) · настройки · профиль', () => {
    expect(teacher.map((item) => item.key)).toEqual([
      'home',
      'assignments',
      'performance',
      'settings',
      'profile',
    ]);
    expect(teacher.filter((item) => item.prominent).map((item) => item.key)).toEqual([
      'performance',
    ]);
  });

  it('самый длинный префикс по сегментам; `activeFor` — разделы, открытые из пункта', () => {
    expect(activeNavKey(teacher, '/teacher')).toBe('home');
    expect(activeNavKey(teacher, '/teacher/wallet')).toBe('home');
    expect(activeNavKey(teacher, '/teacher/performance/groups/g1')).toBe('performance');
    // Ученик и его задания открываются из успеваемости.
    expect(activeNavKey(teacher, '/teacher/students/s1/groups/g1/tasks')).toBe('performance');
    // Группы, курсы, конструктор и спрос на кружки — из настроек («Работа»).
    expect(activeNavKey(teacher, '/teacher/groups/g1')).toBe('settings');
    expect(activeNavKey(teacher, '/teacher/course-builder/j1')).toBe('settings');
    expect(activeNavKey(teacher, '/teacher/clubs/demand')).toBe('settings');
    expect(activeNavKey(teacher, '/teacher/groupsx')).toBe('home');
    expect(activeNavKey(teacher, '/parent')).toBeNull();
  });
});
