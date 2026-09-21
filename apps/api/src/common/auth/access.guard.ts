import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission, type Role } from '@edu/contracts';
import { Errors } from '../errors/app-error';
import { IS_PUBLIC_KEY, PERMISSION_KEY, ROLES_KEY, type RequestWithUser } from './decorators';

/**
 * Глобальный guard прав: @Roles(...) — по активной роли, @RequirePermission(...) — по permission
 * из ROLE_PERMISSIONS. Ресурсные проверки («своя ли группа») — в policies модулей, не здесь.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      targets,
    );
    if (!roles && !permission) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw Errors.unauthorized();

    if (roles && (!user.activeRole || !roles.includes(user.activeRole))) {
      throw Errors.forbidden(`Требуется роль: ${roles.join(' | ')}`);
    }
    if (permission && !hasPermission(user.activeRole, permission)) {
      throw Errors.forbidden(`Нет права: ${permission}`);
    }
    return true;
  }
}
