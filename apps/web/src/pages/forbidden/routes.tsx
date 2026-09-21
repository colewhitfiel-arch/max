import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** 403 — подключается как `{ path: '/403', ...forbiddenRoute }`. */
export const forbiddenRoute: Omit<RouteObject, 'path' | 'index' | 'children'> = {
  lazy: lazyRoute(() => import('./ui/ForbiddenPage'), 'ForbiddenPage'),
};
