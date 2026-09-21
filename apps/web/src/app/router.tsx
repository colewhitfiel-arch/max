/**
 * Сборка роутера (владелец — web-shell): каждая фича экспортирует `routes.tsx`,
 * здесь они подключаются одной строкой под shell своей роли.
 */
import { createBrowserRouter, type RouteObject } from 'react-router';
import { adminRoutes } from '@/pages/admin/routes';
import { authRoutes } from '@/pages/auth/routes';
import { forbiddenRoute } from '@/pages/forbidden/routes';
import { notFoundRoute } from '@/pages/not-found/routes';
import { notificationsRoutes } from '@/pages/notifications/routes';
import { onboardingRoutes } from '@/pages/onboarding/routes';
import { parentAnalyticsRoutes } from '@/pages/parent/analytics/routes';
import { parentChildrenRoutes } from '@/pages/parent/children/routes';
import { parentCoursesRoutes } from '@/pages/parent/courses/routes';
import { parentHomeRoutes } from '@/pages/parent/home/routes';
import { parentPaymentsRoutes } from '@/pages/parent/payments/routes';
import { parentSettingsRoutes } from '@/pages/parent/settings/routes';
import { studentAssignmentsRoutes } from '@/pages/student/assignments/routes';
import { studentCoursesRoutes } from '@/pages/student/courses/routes';
import { studentHomeRoutes } from '@/pages/student/home/routes';
import { studentProfileRoutes } from '@/pages/student/profile/routes';
import { studentSettingsRoutes } from '@/pages/student/settings/routes';
import { studentTutorRoutes } from '@/pages/student/tutor/routes';
import { teacherAssignmentsRoutes } from '@/pages/teacher/assignments/routes';
import { teacherCourseBuilderRoutes } from '@/pages/teacher/course-builder/routes';
import { teacherCoursesRoutes } from '@/pages/teacher/courses/routes';
import { teacherGroupsRoutes } from '@/pages/teacher/groups/routes';
import { teacherHomeRoutes } from '@/pages/teacher/home/routes';
import { teacherMoreRoutes } from '@/pages/teacher/more/routes';
import { teacherStudentsRoutes } from '@/pages/teacher/students/routes';
import { RequireAuth } from '@/shared/auth/guards';
import { config } from '@/shared/config';
import { RootRedirect } from './root-redirect';
import { ParentShell, StudentShell, TeacherShell } from './shells';

const devRoutes: RouteObject[] = config.isDev
  ? [
      {
        path: '/dev/ui',
        lazy: () => import('@edu/ui/playground').then((m) => ({ Component: m.UiPlayground })),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  { path: '/auth', children: authRoutes },
  { path: '/onboarding', element: <RequireAuth />, children: onboardingRoutes },
  {
    path: '/student',
    element: <StudentShell />,
    children: [
      ...studentHomeRoutes,
      ...studentTutorRoutes,
      ...studentCoursesRoutes,
      ...studentAssignmentsRoutes,
      ...studentSettingsRoutes,
      ...studentProfileRoutes,
    ],
  },
  {
    path: '/parent',
    element: <ParentShell />,
    children: [
      ...parentHomeRoutes,
      ...parentChildrenRoutes,
      ...parentAnalyticsRoutes,
      ...parentCoursesRoutes,
      ...parentPaymentsRoutes,
      ...parentSettingsRoutes,
    ],
  },
  {
    path: '/teacher',
    element: <TeacherShell />,
    children: [
      ...teacherHomeRoutes,
      ...teacherGroupsRoutes,
      ...teacherStudentsRoutes,
      ...teacherCoursesRoutes,
      ...teacherCourseBuilderRoutes,
      ...teacherAssignmentsRoutes,
      ...teacherMoreRoutes,
    ],
  },
  { path: '/notifications', element: <RequireAuth />, children: notificationsRoutes },
  { path: '/admin', element: <RequireAuth />, children: adminRoutes },
  ...devRoutes,
  { path: '/403', ...forbiddenRoute },
  { path: '*', ...notFoundRoute },
];

export const router = createBrowserRouter(routes);
