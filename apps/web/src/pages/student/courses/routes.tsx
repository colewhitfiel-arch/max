import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const studentCoursesRoutes: RouteObject[] = [
  { path: 'courses', lazy: lazyRoute(() => import('./ui/CoursesPage'), 'CoursesPage') },
  { path: 'courses/:courseId', lazy: lazyRoute(() => import('./ui/CoursePage'), 'CoursePage') },
  { path: 'blocks/:blockId', lazy: lazyRoute(() => import('./ui/BlockPage'), 'BlockPage') },
];
