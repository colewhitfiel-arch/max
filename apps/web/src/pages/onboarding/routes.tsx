import type { RouteObject } from 'react-router';
import { RequireRole } from '@/shared/auth/guards';
import { lazyRoute } from '@/shared/lib/lazy-route';

/**
 * `/onboarding`: онбординг с ИИ (F1). Только для активной роли STUDENT — ручки онбординга
 * ученические; остальных `RequireRole` уводит на главную их роли.
 */
export const onboardingRoutes: RouteObject[] = [
  {
    element: <RequireRole role="STUDENT" />,
    children: [
      { index: true, lazy: lazyRoute(() => import('./ui/OnboardingPage'), 'OnboardingPage') },
    ],
  },
];
