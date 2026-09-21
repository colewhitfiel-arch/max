import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const studentAssignmentsRoutes: RouteObject[] = [
  { path: 'assignments', lazy: lazyRoute(() => import('./ui/AssignmentsPage'), 'AssignmentsPage') },
  {
    path: 'assignments/:assignmentId',
    lazy: lazyRoute(() => import('./ui/AssignmentPage'), 'AssignmentPage'),
  },
];
