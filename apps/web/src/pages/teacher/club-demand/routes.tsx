import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherClubDemandRoutes: RouteObject[] = [
  {
    path: 'clubs/demand',
    lazy: lazyRoute(() => import('./ui/ClubDemandPage'), 'ClubDemandPage'),
  },
];
