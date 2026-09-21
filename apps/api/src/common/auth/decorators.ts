import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, Role } from '@edu/contracts';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const PERMISSION_KEY = 'auth:permission';

/** Ручка доступна без токена (health, auth). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Ручка доступна только перечисленным активным ролям. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Ручка требует permission (роли выводятся из ROLE_PERMISSIONS контракта). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export type RequestWithUser = Request & { user?: AuthUser };

/** Текущий пользователь из JWT: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) throw new Error('CurrentUser использован на публичной ручке');
    return req.user;
  },
);
