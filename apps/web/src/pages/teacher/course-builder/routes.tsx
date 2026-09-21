import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherCourseBuilderRoutes: RouteObject[] = [
  {
    path: 'course-builder',
    lazy: lazyRoute(() => import('./ui/CourseBuilderPage'), 'CourseBuilderPage'),
  },
  {
    path: 'course-builder/:jobId',
    lazy: lazyRoute(() => import('./ui/GenerationJobPage'), 'GenerationJobPage'),
  },
];
