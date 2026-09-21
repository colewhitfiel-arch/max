import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherStudentsRoutes: RouteObject[] = [
  {
    path: 'students/:studentId',
    lazy: lazyRoute(() => import('./ui/StudentCardPage'), 'StudentCardPage'),
  },
];
