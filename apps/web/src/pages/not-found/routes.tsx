import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/**
 * 404 — подключается как `{ path: '*', ...notFoundRoute }`. Без вложенного index-роута:
 * в React Router 7 `*` с index-ребёнком перевешивает корневой `/`.
 */
export const notFoundRoute: Omit<RouteObject, 'path' | 'index' | 'children'> = {
  lazy: lazyRoute(() => import('./ui/NotFoundPage'), 'NotFoundPage'),
};
