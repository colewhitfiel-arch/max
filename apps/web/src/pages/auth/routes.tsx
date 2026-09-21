import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/shared/auth/guards';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** `/auth/*`: вход, выбор/добавление роли, переключение роли. */
export const authRoutes: RouteObject[] = [
  { index: true, lazy: lazyRoute(() => import('./ui/LoginPage'), 'LoginPage') },
  {
    element: <RequireAuth />,
    children: [
      { path: 'role', lazy: lazyRoute(() => import('./ui/RoleSetupPage'), 'RoleSetupPage') },
      { path: 'switch', lazy: lazyRoute(() => import('./ui/SwitchRolePage'), 'SwitchRolePage') },
    ],
  },
];
