import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const studentSettingsRoutes: RouteObject[] = [
  { path: 'settings', lazy: lazyRoute(() => import('./ui/SettingsPage'), 'SettingsPage') },
];
