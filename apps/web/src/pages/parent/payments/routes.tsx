import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentPaymentsRoutes: RouteObject[] = [
  { path: 'payments', lazy: lazyRoute(() => import('./ui/PaymentsPage'), 'PaymentsPage') },
];
