import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/**
 * «Успеваемость» родителя (относительно `/parent`): выбор ребёнка → аналитика ребёнка →
 * подробности заданий группы (`?task=<assignmentId>` — к какому заданию прокрутить).
 */
export const parentAnalyticsRoutes: RouteObject[] = [
  {
    path: 'analytics',
    lazy: lazyRoute(() => import('./ui/AnalyticsPickerPage'), 'AnalyticsPickerPage'),
  },
  {
    path: 'analytics/:studentId',
    lazy: lazyRoute(() => import('./ui/ChildAnalyticsPage'), 'ChildAnalyticsPage'),
  },
  {
    path: 'analytics/:studentId/groups/:groupId/tasks',
    lazy: lazyRoute(() => import('./ui/TaskDetailsPage'), 'TaskDetailsPage'),
  },
];
