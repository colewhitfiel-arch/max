import { hasPermission, type Permission, type Role } from '@edu/contracts';
import { Spinner } from '@edu/ui';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useActiveRole, useAuthStore } from './index';
import { AUTH_PATH, FORBIDDEN_PATH, roleHomePath } from './role-routes';

interface GuardProps {
  /** Если не передано — рендерится `<Outlet />` (использование как layout-роут). */
  children?: ReactNode;
}

function Content({ children }: GuardProps) {
  return children !== undefined ? <>{children}</> : <Outlet />;
}

/** Анонима отправляет на `/auth`, запоминая, откуда пришёл. */
export function RequireAuth({ children }: GuardProps) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'idle' || status === 'loading') return <Spinner label="Загрузка" />;
  if (status === 'anonymous') {
    return <Navigate to={AUTH_PATH} replace state={{ from: location.pathname }} />;
  }
  return <Content>{children}</Content>;
}

/** Не та активная роль → редирект на корень своей роли (или на выбор роли). */
export function RequireRole({ role, children }: GuardProps & { role: Role }) {
  const activeRole = useActiveRole();
  if (activeRole !== role) return <Navigate to={roleHomePath(activeRole)} replace />;
  return <Content>{children}</Content>;
}

/** Нет permission у активной роли → страница 403. */
export function RequirePermission({
  permission,
  children,
}: GuardProps & { permission: Permission }) {
  const activeRole = useActiveRole();
  if (!hasPermission(activeRole, permission)) return <Navigate to={FORBIDDEN_PATH} replace />;
  return <Content>{children}</Content>;
}

/** Условный рендер по permission: `<Can permission="teacher:attendance.mark">…</Can>`. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const activeRole = useActiveRole();
  return <>{hasPermission(activeRole, permission) ? children : fallback}</>;
}
