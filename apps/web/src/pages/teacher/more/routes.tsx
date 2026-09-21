import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherMoreRoutes: RouteObject[] = [
  { path: 'more', lazy: lazyRoute(() => import('./ui/MorePage'), 'MorePage') },
];
