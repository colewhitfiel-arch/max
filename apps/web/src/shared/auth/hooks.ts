import {
  hasPermission,
  type MeDto,
  type Permission,
  permissionsForRole,
  type Role,
} from '@edu/contracts';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from './store';

const NO_PERMISSIONS: readonly Permission[] = [];

/** Статус сессии и действия. */
export function useAuth() {
  return useAuthStore(
    useShallow((s) => ({
      status: s.status,
      me: s.me,
      error: s.error,
      isAuthenticated: s.status === 'authenticated',
      loginDev: s.loginDev,
      loginMax: s.loginMax,
      logout: s.logout,
      switchRole: s.switchRole,
      addRole: s.addRole,
      updateMe: s.updateMe,
    })),
  );
}

/** Профиль текущего пользователя; null до входа. */
export function useMe(): MeDto | null {
  return useAuthStore((s) => s.me);
}

export function useActiveRole(): Role | null {
  return useAuthStore((s) => s.me?.activeRole ?? null);
}

/** Есть ли у активной роли permission (через `ROLE_PERMISSIONS` контракта). */
export function useHasPermission(permission: Permission): boolean {
  const role = useActiveRole();
  return hasPermission(role, permission);
}

/** Все permissions активной роли (для скрытия пунктов меню/действий). */
export function useCapabilities(): readonly Permission[] {
  const role = useActiveRole();
  return role ? permissionsForRole(role) : NO_PERMISSIONS;
}
