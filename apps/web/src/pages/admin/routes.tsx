import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** `/admin` — заглушка для SCHOOL_ADMIN (роль зарезервирована). */
export const adminRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/AdminPage'), 'AdminPage') },
];
