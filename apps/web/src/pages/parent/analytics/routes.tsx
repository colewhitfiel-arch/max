import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentAnalyticsRoutes: RouteObject[] = [
  { path: 'analytics', lazy: lazyRoute(() => import('./ui/AnalyticsPage'), 'AnalyticsPage') },
];
