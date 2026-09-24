import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/**
 * Ученик у преподавателя (относительно `/teacher`): успеваемость (`?club=<groupId>` — раскрытый
 * курс) → задания ученика в группе (`?task=<assignmentId>` — к какому заданию прокрутить).
 */
export const teacherStudentsRoutes: RouteObject[] = [
  {
    path: 'students/:studentId',
    lazy: lazyRoute(() => import('./ui/StudentPerformancePage'), 'StudentPerformancePage'),
  },
  {
    path: 'students/:studentId/groups/:groupId/tasks',
    lazy: lazyRoute(() => import('./ui/StudentTasksPage'), 'StudentTasksPage'),
  },
];
