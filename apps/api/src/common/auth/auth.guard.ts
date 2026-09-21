import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../errors/app-error';
import { requestContext } from '../logger/request-context';
import { IS_PUBLIC_KEY, type RequestWithUser } from './decorators';
import { JwtService } from './jwt.service';

/** Глобальный guard: проверяет Bearer JWT и кладёт AuthUser в request.user. Публичные ручки — @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    const user = await this.jwt.verifyAccess(header.slice('Bearer '.length).trim());
    req.user = user;

    const store = requestContext.getStore();
    if (store) {
      store.userId = user.userId;
      store.role = user.activeRole ?? undefined;
    }
    return true;
  }
}
