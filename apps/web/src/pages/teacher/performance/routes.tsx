import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/**
 * «Общая успеваемость» преподавателя (относительно `/teacher`): группы за период → ученики
 * группы. Подробная успеваемость ученика — `teacherStudentsRoutes` (`students/:studentId`).
 */
export const teacherPerformanceRoutes: RouteObject[] = [
  {
    path: 'performance',
    lazy: lazyRoute(() => import('./ui/PerformancePage'), 'PerformancePage'),
  },
  {
    path: 'performance/groups/:groupId',
    lazy: lazyRoute(() => import('./ui/GroupStudentsPage'), 'GroupStudentsPage'),
  },
];
