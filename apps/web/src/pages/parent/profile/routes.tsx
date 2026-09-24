import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentProfileRoutes: RouteObject[] = [
  { path: 'profile', lazy: lazyRoute(() => import('./ui/ParentProfilePage'), 'ParentProfilePage') },
];
