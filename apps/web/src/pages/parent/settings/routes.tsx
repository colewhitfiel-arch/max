import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const parentSettingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    lazy: lazyRoute(() => import('./ui/ParentSettingsPage'), 'ParentSettingsPage'),
  },
];
