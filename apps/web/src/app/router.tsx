/**
 * Сборка роутера (владелец — web-shell): каждая фича экспортирует `routes.tsx`,
 * здесь они подключаются одной строкой под shell своей роли.
 */
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { DemoTour } from '@/features/demo-tour';
import { adminRoutes } from '@/pages/admin/routes';
import { authRoutes } from '@/pages/auth/routes';
import { checkInRoutes } from '@/pages/check-in/routes';
import { forbiddenRoute } from '@/pages/forbidden/routes';
import { inviteRoutes, joinRoutes } from '@/pages/invite/routes';
import { notFoundRoute } from '@/pages/not-found/routes';
import { notificationsRoutes } from '@/pages/notifications/routes';
import { onboardingRoutes } from '@/pages/onboarding/routes';
import { parentAnalyticsRoutes } from '@/pages/parent/analytics/routes';
import { parentChildrenRoutes } from '@/pages/parent/children/routes';
import { parentCoursesRoutes } from '@/pages/parent/courses/routes';
import { parentHomeRoutes } from '@/pages/parent/home/routes';
import { parentPaymentsRoutes } from '@/pages/parent/payments/routes';
import { parentProfileRoutes } from '@/pages/parent/profile/routes';
import { parentSettingsRoutes } from '@/pages/parent/settings/routes';
import { parentTutorRoutes } from '@/pages/parent/tutor/routes';
import { parentWalletRoutes } from '@/pages/parent/wallet/routes';
import { studentAssignmentsRoutes } from '@/pages/student/assignments/routes';
import { studentCoursesRoutes } from '@/pages/student/courses/routes';
import { studentHomeRoutes } from '@/pages/student/home/routes';
import { studentProfileRoutes } from '@/pages/student/profile/routes';
import { studentSettingsRoutes } from '@/pages/student/settings/routes';
import { studentTutorRoutes } from '@/pages/student/tutor/routes';
import { teacherAssignmentsRoutes } from '@/pages/teacher/assignments/routes';
import { teacherAttendanceRoutes } from '@/pages/teacher/attendance/routes';
import { teacherClubDemandRoutes } from '@/pages/teacher/club-demand/routes';
import { teacherCourseBuilderRoutes } from '@/pages/teacher/course-builder/routes';
import { teacherCoursesRoutes } from '@/pages/teacher/courses/routes';
import { teacherGroupsRoutes } from '@/pages/teacher/groups/routes';
import { teacherHomeRoutes } from '@/pages/teacher/home/routes';
import { teacherMoreRoutes } from '@/pages/teacher/more/routes';
import { teacherPerformanceRoutes } from '@/pages/teacher/performance/routes';
import { teacherProfileRoutes } from '@/pages/teacher/profile/routes';
import { teacherSettingsRoutes } from '@/pages/teacher/settings/routes';
import { teacherStudentsRoutes } from '@/pages/teacher/students/routes';
import { teacherWalletRoutes } from '@/pages/teacher/wallet/routes';
import { RequireAuth } from '@/shared/auth/guards';
import { config } from '@/shared/config';
import { RootRedirect } from './root-redirect';
import { RouteErrorScreen } from './route-error';
import { ParentShell, StudentShell, TeacherShell } from './shells';
import { Splash } from './splash';

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
      ...parentWalletRoutes,
      ...parentChildrenRoutes,
      ...parentTutorRoutes,
      ...parentAnalyticsRoutes,
      ...parentCoursesRoutes,
      ...parentPaymentsRoutes,
      ...parentSettingsRoutes,
      ...parentProfileRoutes,
    ],
  },
  {
    path: '/teacher',
    element: <TeacherShell />,
    children: [
      ...teacherHomeRoutes,
      ...teacherWalletRoutes,
      ...teacherPerformanceRoutes,
      ...teacherStudentsRoutes,
      ...teacherGroupsRoutes,
      ...teacherCoursesRoutes,
      ...teacherCourseBuilderRoutes,
      ...teacherClubDemandRoutes,
      ...teacherAssignmentsRoutes,
      ...teacherAttendanceRoutes,
      ...teacherSettingsRoutes,
      ...teacherProfileRoutes,
      // `/teacher/more` — старый адрес «Ещё»: редирект на настройки.
      ...teacherMoreRoutes,
    ],
  },
  { path: '/notifications', element: <RequireAuth />, children: notificationsRoutes },
  // Ссылка-приглашение родителя (F14): открывает ученик, роль проверяет сама страница.
  { path: '/invite', element: <RequireAuth />, children: inviteRoutes },
  // Ссылка-приглашение в группу преподавателя (F19): открывает ученик, роль проверяет страница.
  { path: '/join', element: <RequireAuth />, children: joinRoutes },
  // Отметка на занятии по QR-коду (F6a): сканер ученика и диплинк; роль проверяет страница.
  { path: '/check-in', element: <RequireAuth />, children: checkInRoutes },
  { path: '/admin', element: <RequireAuth />, children: adminRoutes },
  ...devRoutes,
  { path: '/403', ...forbiddenRoute },
  { path: '*', ...notFoundRoute },
];

/** Корневой layout: страницы и поверх них — демонстрационный режим (без тура ничего не рисует). */
function RootLayout() {
  return (
    <>
      <Outlet />
      <DemoTour />
    </>
  );
}

/**
 * Pathless-корень с `errorElement`: ошибки рендера страниц и падения `lazy()` показывают наш экран,
 * а не встроенный «Unexpected Application Error!» (ErrorBoundary в providers их не видит).
 */
export const rootRoutes: RouteObject[] = [
  // hydrateFallbackElement — пока грузится lazy-страница первого адреса (иначе пусто и предупреждение).
  {
    element: <RootLayout />,
    errorElement: <RouteErrorScreen />,
    hydrateFallbackElement: <Splash />,
    children: routes,
  },
];

export const router = createBrowserRouter(rootRoutes);
