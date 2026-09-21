/**
 * Пункты нижнего меню по роли (владелец — web-shell). Агент фичи просит добавить пункт здесь.
 * `path` — абсолютный маршрут; активность определяется по самому длинному совпавшему префиксу.
 */
import type { Role } from '@edu/contracts';
import {
  AiIcon,
  BookIcon,
  CalendarIcon,
  CheckIcon,
  HomeIcon,
  InboxIcon,
  type IconProps,
  SettingsIcon,
  UserIcon,
  UsersIcon,
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
}

export const BOTTOM_NAV: Record<Role, BottomNavItem[]> = {
  STUDENT: [
    { key: 'home', path: '/student', labelKey: 'nav.home', icon: HomeIcon },
    { key: 'tutor', path: '/student/tutor', labelKey: 'nav.tutor', icon: AiIcon },
    {
      key: 'courses',
      path: '/student/courses',
      labelKey: 'nav.courses',
      icon: BookIcon,
      prominent: true,
    },
    { key: 'settings', path: '/student/settings', labelKey: 'nav.settings', icon: SettingsIcon },
    { key: 'profile', path: '/student/profile', labelKey: 'nav.profile', icon: UserIcon },
  ],
  PARENT: [
    { key: 'home', path: '/parent', labelKey: 'nav.home', icon: HomeIcon },
    { key: 'children', path: '/parent/children', labelKey: 'nav.children', icon: UsersIcon },
    { key: 'analytics', path: '/parent/analytics', labelKey: 'nav.analytics', icon: CalendarIcon },
    { key: 'clubs', path: '/parent/courses', labelKey: 'nav.clubs', icon: BookIcon },
    { key: 'payments', path: '/parent/payments', labelKey: 'nav.payments', icon: InboxIcon },
  ],
  TEACHER: [
    { key: 'home', path: '/teacher', labelKey: 'nav.home', icon: HomeIcon },
    { key: 'groups', path: '/teacher/groups', labelKey: 'nav.groups', icon: UsersIcon },
    { key: 'courses', path: '/teacher/courses', labelKey: 'nav.courses', icon: BookIcon },
    {
      key: 'assignments',
      path: '/teacher/assignments',
      labelKey: 'nav.assignments',
      icon: CheckIcon,
    },
    { key: 'more', path: '/teacher/more', labelKey: 'nav.more', icon: SettingsIcon },
  ],
  SCHOOL_ADMIN: [{ key: 'home', path: '/admin', labelKey: 'nav.home', icon: HomeIcon }],
};

/** Активный пункт: самый длинный path, являющийся префиксом текущего пути. */
export function activeNavKey(items: BottomNavItem[], pathname: string): string | null {
  let best: BottomNavItem | null = null;
  for (const item of items) {
    const matches = pathname === item.path || pathname.startsWith(`${item.path}/`);
    if (matches && (!best || item.path.length > best.path.length)) best = item;
  }
  return best?.key ?? null;
}
