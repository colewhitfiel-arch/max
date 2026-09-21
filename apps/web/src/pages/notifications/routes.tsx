import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const notificationsRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/NotificationsPage'), 'NotificationsPage') },
];
