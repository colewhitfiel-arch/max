import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherAssignmentsRoutes: RouteObject[] = [
  {
    path: 'assignments',
    lazy: lazyRoute(() => import('./ui/TeacherAssignmentsPage'), 'TeacherAssignmentsPage'),
  },
];
