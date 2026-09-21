import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentCoursesRoutes: RouteObject[] = [
  { path: 'courses', lazy: lazyRoute(() => import('./ui/ChildClubsPage'), 'ChildClubsPage') },
  {
    path: 'courses/teacher/:teacherId',
    lazy: lazyRoute(() => import('./ui/TeacherCardPage'), 'TeacherCardPage'),
  },
];
