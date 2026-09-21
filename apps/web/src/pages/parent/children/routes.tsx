import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentChildrenRoutes: RouteObject[] = [
  { path: 'children', lazy: lazyRoute(() => import('./ui/ChildrenPage'), 'ChildrenPage') },
];
