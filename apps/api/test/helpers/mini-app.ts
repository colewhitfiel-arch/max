import { type INestApplication, Module, type Type } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuthCoreModule } from '../../src/common/auth/auth.module';
import { JwtService } from '../../src/common/auth/jwt.service';
import type { AuthUser } from '../../src/common/auth/auth-user';
import { ApiExceptionFilter } from '../../src/common/errors/api-exception.filter';
import { LoggerModule } from '../../src/common/logger/logger.module';
import { requestIdMiddleware } from '../../src/common/logger/request-id.middleware';
import { EnvModule } from '../../src/config/env.module';
import { testEnv } from './env';

/**
 * Минимальное Nest-приложение для тестов foundation (guards, фильтр ошибок) —
 * без БД и доменных модулей. Контроллеры передаются снаружи.
 */
export async function createMiniApp(controllers: Type<unknown>[]): Promise<INestApplication> {
  const env = testEnv();

  @Module({
    imports: [EnvModule.forRoot(env), LoggerModule, AuthCoreModule],
    controllers,
    providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
  })
  class MiniModule {}

  const moduleRef = await Test.createTestingModule({ imports: [MiniModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.use(requestIdMiddleware);
  await app.init();
  return app;
}

export async function bearerFor(
  app: INestApplication,
  user: Partial<AuthUser> = {},
): Promise<string> {
  const jwt = app.get(JwtService);
  const token = await jwt.signAccess({
    userId: '00000000-0000-7000-8000-000000000011',
    maxUserId: 'max-student-1',
    roles: ['STUDENT'],
    activeRole: 'STUDENT',
    profileId: '00000000-0000-7000-8000-000000000021',
    ...user,
  });
  return `Bearer ${token}`;
}
