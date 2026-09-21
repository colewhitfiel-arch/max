import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const studentHomeRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/StudentHomePage'), 'StudentHomePage') },
];
