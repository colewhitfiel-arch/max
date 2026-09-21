import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const studentTutorRoutes: RouteObject[] = [
  { path: 'tutor', lazy: lazyRoute(() => import('./ui/TutorPage'), 'TutorPage') },
];
