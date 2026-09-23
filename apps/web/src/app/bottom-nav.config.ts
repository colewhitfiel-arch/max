/**
 * Пункты нижнего меню по роли (владелец — web-shell). Агент фичи просит добавить пункт здесь.
 * `path` — абсолютный маршрут; активность определяется по самому длинному совпавшему префиксу.
 */
import type { Role } from '@edu/contracts';
import {
  AiIcon,
  BookIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  HomeIcon,
  type IconProps,
  PieChartIcon,
  SettingsIcon,
  UserIcon,
} from '@edu/ui';
import type { ComponentType } from 'react';

export interface BottomNavItem {
  key: string;
  path: string;
  /** Ключ в namespace `common` (nav.*). */
  labelKey: string;
  icon: ComponentType<IconProps>;
  /** Акцентный (крупный центральный) пункт, см. `BottomNavigationItem.prominent`. */
  prominent?: boolean;
  /** Размер иконки, см. `BottomNavigationItem.iconSize`. */
  iconSize?: 'md' | 'lg';
  /**
   * Другие разделы (абсолютные префиксы), в которых пункт тоже активен: экраны, открытые
   * из этого пункта, но лежащие вне его `path` (ученик из успеваемости — `/teacher/students`).
   */
  activeFor?: string[];
}

export const BOTTOM_NAV: Record<Role, BottomNavItem[]> = {
  STUDENT: [
    { key: 'home', path: '/student', labelKey: 'nav.home', icon: HomeIcon },
    { key: 'tutor', path: '/student/tutor', labelKey: 'nav.tutor', icon: AiIcon, iconSize: 'lg' },
    {
      key: 'assignments',
      path: '/student/assignments',
      labelKey: 'nav.assignments',
      icon: BookIcon,
      prominent: true,
    },
    { key: 'settings', path: '/student/settings', labelKey: 'nav.settings', icon: SettingsIcon },
    { key: 'profile', path: '/student/profile', labelKey: 'nav.profile', icon: UserIcon },
  ],
  // Как у ученика (макет): главная · ИИ-тьютор · аналитика (крупная зелёная) · настройки · профиль.
  // Дети, кружки и оплата открываются с экранов (сердце «+», «Добавить кружок», кошелёк).
  PARENT: [
    { key: 'home', path: '/parent', labelKey: 'nav.home', icon: HomeIcon },
    { key: 'tutor', path: '/parent/tutor', labelKey: 'nav.tutor', icon: AiIcon, iconSize: 'lg' },
    {
      key: 'analytics',
      path: '/parent/analytics',
      labelKey: 'nav.analytics',
      icon: PieChartIcon,
      prominent: true,
    },
    { key: 'settings', path: '/parent/settings', labelKey: 'nav.settings', icon: SettingsIcon },
    { key: 'profile', path: '/parent/profile', labelKey: 'nav.profile', icon: UserIcon },
  ],
  // Макет репетитора: главная · задания · успеваемость (крупная оранжевая шапочка) · настройки ·
  // профиль. Группы, курсы, конструктор и спрос на кружки открываются из настроек («Работа»),
  // кошелёк — чипом на главной.
  TEACHER: [
    { key: 'home', path: '/teacher', labelKey: 'nav.home', icon: HomeIcon },
    {
      key: 'assignments',
      path: '/teacher/assignments',
      labelKey: 'nav.assignments',
      icon: ClipboardListIcon,
      iconSize: 'lg',
    },
    {
      key: 'performance',
      path: '/teacher/performance',
      labelKey: 'nav.performance',
      icon: GraduationCapIcon,
      prominent: true,
      activeFor: ['/teacher/students'],
    },
    {
      key: 'settings',
      path: '/teacher/settings',
      labelKey: 'nav.settings',
      icon: SettingsIcon,
      activeFor: [
        '/teacher/groups',
        '/teacher/courses',
        '/teacher/course-builder',
        '/teacher/clubs',
      ],
    },
    { key: 'profile', path: '/teacher/profile', labelKey: 'nav.profile', icon: UserIcon },
  ],
  SCHOOL_ADMIN: [{ key: 'home', path: '/admin', labelKey: 'nav.home', icon: HomeIcon }],
};

/**
 * Активный пункт: самый длинный префикс текущего пути среди `path` и `activeFor` пунктов
 * (граница — по сегменту: `/teacher/groups` не совпадает с `/teacher/groupsx`).
 */
export function activeNavKey(items: BottomNavItem[], pathname: string): string | null {
  let bestKey: string | null = null;
  let bestLength = -1;
  for (const item of items) {
    for (const prefix of [item.path, ...(item.activeFor ?? [])]) {
      const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (matches && prefix.length > bestLength) {
        bestKey = item.key;
        bestLength = prefix.length;
      }
    }
  }
  return bestKey;
}
