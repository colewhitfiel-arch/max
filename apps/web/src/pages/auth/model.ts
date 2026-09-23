import type { Role } from '@edu/contracts';

/**
 * Роли, которые пользователь выбирает или добавляет сам на `/auth/role` (`POST /auth/roles`).
 * Администратора школы так не добавить — `SCHOOL_ADMIN` бэкенд не выдаёт (501).
 */
export const ADDABLE_ROLES: readonly Role[] = ['STUDENT', 'PARENT', 'TEACHER'];

/** Есть что добавить: хотя бы одной роли из `ADDABLE_ROLES` у пользователя ещё нет. */
export function canAddRole(roles: readonly Role[]): boolean {
  return ADDABLE_ROLES.some((role) => !roles.includes(role));
}
