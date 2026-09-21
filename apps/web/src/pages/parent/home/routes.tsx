import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentHomeRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/ParentHomePage'), 'ParentHomePage') },
];
