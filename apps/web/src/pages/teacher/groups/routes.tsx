import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

export const teacherGroupsRoutes: RouteObject[] = [
  { path: 'groups', lazy: lazyRoute(() => import('./ui/GroupsPage'), 'GroupsPage') },
  { path: 'groups/:groupId', lazy: lazyRoute(() => import('./ui/GroupPage'), 'GroupPage') },
];
