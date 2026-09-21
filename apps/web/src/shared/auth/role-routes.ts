import type { Role } from '@edu/contracts';

/** Корневой маршрут роли. SCHOOL_ADMIN — заглушка (501-страница). */
export const ROLE_HOME: Record<Role, string> = {
  STUDENT: '/student',
  PARENT: '/parent',
  TEACHER: '/teacher',
  SCHOOL_ADMIN: '/admin',
};

export function roleHomePath(role: Role | null | undefined): string {
  return role ? ROLE_HOME[role] : '/auth/role';
}

export const AUTH_PATH = '/auth';
export const ROLE_SETUP_PATH = '/auth/role';
export const SWITCH_ROLE_PATH = '/auth/switch';
export const ONBOARDING_PATH = '/onboarding';
export const FORBIDDEN_PATH = '/403';
