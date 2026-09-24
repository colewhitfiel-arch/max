import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentTutorRoutes: RouteObject[] = [
  { path: 'tutor', lazy: lazyRoute(() => import('./ui/ParentTutorPage'), 'ParentTutorPage') },
];
