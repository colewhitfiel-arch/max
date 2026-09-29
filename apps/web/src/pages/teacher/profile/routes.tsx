import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherProfileRoutes: RouteObject[] = [
  {
    path: 'profile',
    lazy: lazyRoute(() => import('./ui/TeacherProfilePage'), 'TeacherProfilePage'),
  },
  {
    path: 'profile/subjects',
    lazy: lazyRoute(() => import('./ui/TeacherSubjectsPage'), 'TeacherSubjectsPage'),
  },
];
