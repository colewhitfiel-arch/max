import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherAttendanceRoutes: RouteObject[] = [
  {
    path: 'attendance',
    lazy: lazyRoute(() => import('./ui/AttendanceLessonsPage'), 'AttendanceLessonsPage'),
  },
  {
    path: 'attendance/:lessonId',
    lazy: lazyRoute(() => import('./ui/AttendanceSheetPage'), 'AttendanceSheetPage'),
  },
];
