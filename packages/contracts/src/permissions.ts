/**
 * Централизованный слой прав. Используется и фронтом (route guards, скрытие действий),
 * и бэком (RolesGuard / policies). Роль определяет набор permissions; ресурсные проверки
 * («своя ли группа») — в policies модулей, не здесь.
 */
import { z } from 'zod';
import { type Role, ROLES } from './enums';

export const PERMISSIONS = [
  // общие
  'common:profile.view',
  'common:profile.edit',
  'common:settings.edit',
  'common:notifications.view',
  'common:support.create',
  'common:files.upload',
  // ученик
  'student:onboarding.complete',
  'student:home.view',
  'student:calendar.view',
  'student:courses.view',
  'student:blocks.complete',
  'student:assignments.view',
  'student:assignments.submit',
  'student:tutor.chat',
  'student:trajectory.view',
  'student:parents.link',
  // родитель
  'parent:children.manage',
  'parent:child.home.view',
  'parent:child.analytics.view',
  'parent:child.clubs.view',
  'parent:child.calendar.view',
  'parent:payments.view',
  'parent:payments.pay',
  'parent:tutor.chat',
  // преподаватель
  'teacher:home.view',
  'teacher:groups.view',
  'teacher:students.view',
  'teacher:lessons.manage',
  'teacher:attendance.mark',
  'teacher:assignments.manage',
  'teacher:submissions.grade',
  'teacher:courses.manage',
  'teacher:course-builder.use',
  // администратор школы (зарезервировано)
  'admin:school.manage',
] as const;

export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;

const COMMON: Permission[] = [
  'common:profile.view',
  'common:profile.edit',
  'common:settings.edit',
  'common:notifications.view',
  'common:support.create',
  'common:files.upload',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  STUDENT: [
    ...COMMON,
    'student:onboarding.complete',
    'student:home.view',
    'student:calendar.view',
    'student:courses.view',
    'student:blocks.complete',
    'student:assignments.view',
    'student:assignments.submit',
    'student:tutor.chat',
    'student:trajectory.view',
    'student:parents.link',
  ],
  PARENT: [
    ...COMMON,
    'parent:children.manage',
    'parent:child.home.view',
    'parent:child.analytics.view',
    'parent:child.clubs.view',
    'parent:child.calendar.view',
    'parent:payments.view',
    'parent:payments.pay',
    'parent:tutor.chat',
  ],
  TEACHER: [
    ...COMMON,
    'teacher:home.view',
    'teacher:groups.view',
    'teacher:students.view',
    'teacher:lessons.manage',
    'teacher:attendance.mark',
    'teacher:assignments.manage',
    'teacher:submissions.grade',
    'teacher:courses.manage',
    'teacher:course-builder.use',
  ],
  SCHOOL_ADMIN: [...COMMON, 'admin:school.manage'],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(
  role: Role | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Роли, которым доступна permission (для описания guard'ов). */
export function rolesWithPermission(permission: Permission): Role[] {
  return ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(permission));
}
