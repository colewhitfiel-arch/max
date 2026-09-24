import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherSettingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    lazy: lazyRoute(() => import('./ui/TeacherSettingsPage'), 'TeacherSettingsPage'),
  },
];
