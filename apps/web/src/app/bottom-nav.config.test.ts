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
    // Неизвестный раздел: «Главная» — только точный корень, ничего не подсвечено.
    expect(activeNavKey(teacher, '/teacher/groupsx')).toBeNull();
    expect(activeNavKey(teacher, '/parent')).toBeNull();
  });

  it('«Главная» ученика — только корень: курсы и блоки подсвечивают задания', () => {
    const student = BOTTOM_NAV.STUDENT;
    expect(activeNavKey(student, '/student')).toBe('home');
    expect(activeNavKey(student, '/student/courses')).toBe('assignments');
    expect(activeNavKey(student, '/student/courses/c1')).toBe('assignments');
    expect(activeNavKey(student, '/student/blocks/b1')).toBe('assignments');
    expect(activeNavKey(student, '/student/assignments/a1')).toBe('assignments');
    expect(activeNavKey(student, '/student/tutor')).toBe('tutor');
    expect(activeNavKey(student, '/student/unknown')).toBeNull();
  });

  it('родитель: экраны, открытые с главной, подсвечивают «Главную»', () => {
    const parent = BOTTOM_NAV.PARENT;
    expect(activeNavKey(parent, '/parent')).toBe('home');
    expect(activeNavKey(parent, '/parent/children')).toBe('home');
    expect(activeNavKey(parent, '/parent/wallet')).toBe('home');
    expect(activeNavKey(parent, '/parent/courses/teacher/t1')).toBe('home');
    expect(activeNavKey(parent, '/parent/payments')).toBe('home');
    expect(activeNavKey(parent, '/parent/analytics/s1')).toBe('analytics');
    expect(activeNavKey(parent, '/parent/tutor')).toBe('tutor');
  });
});
