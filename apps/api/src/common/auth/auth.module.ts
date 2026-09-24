import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { type Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { AccessGuard } from './access.guard';
import { AUTH_PROVIDER } from './auth-provider';
import { AuthGuard } from './auth.guard';
import { JwtService } from './jwt.service';
import { DevAuthProvider } from './providers/dev-auth.provider';
import { MaxAuthProvider } from './providers/max-auth.provider';

/**
 * Ядро аутентификации: JWT, провайдер (dev | max), глобальные guards.
 * Выдача сессий и работа с пользователями — в modules/identity.
 */
@Global()
@Module({
  providers: [
    JwtService,
    DevAuthProvider,
    MaxAuthProvider,
    {
      provide: AUTH_PROVIDER,
      inject: [ENV, DevAuthProvider, MaxAuthProvider],
      useFactory: (env: Env, dev: DevAuthProvider, max: MaxAuthProvider) =>
        env.AUTH_PROVIDER === 'max' ? max : dev,
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  // DevAuthProvider экспортируется отдельно: демо-вход не зависит от выбранного AUTH_PROVIDER
  // (на стенде с подписью MAX браузерный вход демо-пользователем тоже нужен).
  exports: [JwtService, AUTH_PROVIDER, DevAuthProvider],
})
export class AuthCoreModule {}
