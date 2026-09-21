import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherCoursesRoutes: RouteObject[] = [
  {
    path: 'courses',
    lazy: lazyRoute(() => import('./ui/TeacherCoursesPage'), 'TeacherCoursesPage'),
  },
  {
    path: 'courses/:courseId',
    lazy: lazyRoute(() => import('./ui/TeacherCoursePage'), 'TeacherCoursePage'),
  },
];
