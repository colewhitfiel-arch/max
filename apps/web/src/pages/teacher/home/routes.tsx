import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherHomeRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/TeacherHomePage'), 'TeacherHomePage') },
];
