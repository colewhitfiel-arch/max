import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** Пополнение кошелька родителя (заглушка, docs/07 F13) — из чипа кошелька на главной. */
export const parentWalletRoutes: RouteObject[] = [
  { path: 'wallet', lazy: lazyRoute(() => import('./ui/WalletTopUpPage'), 'WalletTopUpPage') },
];
