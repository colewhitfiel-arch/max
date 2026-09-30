import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** Подключается под `/check-in` с `<RequireAuth />` (отметка по QR-коду занятия, F6a). */
export const checkInRoutes: RouteObject[] = [
  { path: ':code', lazy: lazyRoute(() => import('./ui/CheckInPage'), 'CheckInPage') },
];
