import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const studentProfileRoutes: RouteObject[] = [
  { path: 'profile', lazy: lazyRoute(() => import('./ui/ProfilePage'), 'ProfilePage') },
];
