import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** Подключается под `/invite` с `<RequireAuth />` (ссылка-приглашение родителя, F14). */
export const inviteRoutes: RouteObject[] = [
  { path: ':token', lazy: lazyRoute(() => import('./ui/InviteAcceptPage'), 'InviteAcceptPage') },
];

/** Подключается под `/join` с `<RequireAuth />` (ссылка-приглашение в группу преподавателя, F19). */
export const joinRoutes: RouteObject[] = [
  { path: ':token', lazy: lazyRoute(() => import('./ui/JoinGroupPage'), 'JoinGroupPage') },
];
