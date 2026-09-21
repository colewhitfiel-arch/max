import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** `/onboarding`: заглушка онбординга с ИИ (F1). */
export const onboardingRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/OnboardingPage'), 'OnboardingPage') },
];
