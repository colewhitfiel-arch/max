/**
 * RateLimitGuard: fixed window в KeyValueStore, счётчик по IP (публичные ручки) или по
 * пользователю, 429 RATE_LIMITED с Retry-After; в NODE_ENV=test по умолчанию выключен.
 * Плюс проверка, что ручки входа, привязки ребёнка и ИИ помечены нужной группой.
 */
import { Controller, Get, Global, type INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthCoreModule } from '../../src/common/auth/auth.module';
import { Public } from '../../src/common/auth/decorators';
import { ApiExceptionFilter } from '../../src/common/errors/api-exception.filter';
import { KV_STORE, MemoryKeyValueStore } from '../../src/common/kv/key-value-store';
import { LoggerModule } from '../../src/common/logger/logger.module';
import {
  RATE_LIMIT_KEY,
  RateLimit,
  clientIp,
  isRateLimitEnabled,
} from '../../src/common/rate-limit/rate-limit';
import { type Env } from '../../src/config/env';
import { EnvModule } from '../../src/config/env.module';
import { AiStreamController } from '../../src/modules/ai/ai-stream.controller';
import { AiController } from '../../src/modules/ai/ai.controller';
import { CourseBuilderController } from '../../src/modules/course-builder/course-builder.controller';
import { AuthController } from '../../src/modules/identity/auth.controller';
import { ChildrenController } from '../../src/modules/parent/children.controller';
import { testEnv } from '../helpers/env';
import { bearerFor } from '../helpers/mini-app';

@Controller('rl')
class RateLimitedController {
  @Public()
  @RateLimit('auth')
  @Get('login')
  login() {
    return { ok: true };
  }

  @RateLimit('link')
  @Get('link')
  link() {
    return { ok: true };
  }

  @RateLimit('ai')
  @Get('ai')
  ai() {
    return { ok: true };
  }

  @RateLimit('generation')
  @Get('generation')
  generation() {
    return { ok: true };
  }
}

async function createApp(overrides: Partial<Record<keyof Env, string>>): Promise<INestApplication> {
  const env = testEnv(overrides);

  @Global()
  @Module({
    providers: [{ provide: KV_STORE, useValue: new MemoryKeyValueStore() }],
    exports: [KV_STORE],
  })
  class MemoryKvModule {}

  @Module({
    imports: [EnvModule.forRoot(env), LoggerModule, MemoryKvModule, AuthCoreModule],
    controllers: [RateLimitedController],
    providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
  })
  class RateLimitTestModule {}

  const moduleRef = await Test.createTestingModule({ imports: [RateLimitTestModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('RateLimitGuard', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('публичная ручка: лимит по IP, 429 с Retry-After, другой IP — свой счётчик', async () => {
    app = await createApp({ RATE_LIMIT_ENABLED: '1', RATE_LIMIT_AUTH_PER_MIN: '2' });
    const login = (ip: string) =>
      request(app!.getHttpServer()).get('/rl/login').set('X-Forwarded-For', ip);

    await login('198.51.100.7').expect(200);
    // Клиент — последний адрес X-Forwarded-For (его дописал прокси); подставленное клиентом
    // в начало цепочки лимит не обходит
    await login('203.0.113.66, 198.51.100.7').expect(200);
    const limited = await login('192.0.2.1, 198.51.100.7').expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    await login('203.0.113.9').expect(200);
  });

  it('ручка пользователя: лимит на пользователя, а не на IP', async () => {
    app = await createApp({ RATE_LIMIT_ENABLED: '1', RATE_LIMIT_LINK_PER_HOUR: '1' });
    const alice = await bearerFor(app, { userId: '00000000-0000-7000-8000-0000000000a1' });
    const bob = await bearerFor(app, { userId: '00000000-0000-7000-8000-0000000000b2' });
    const link = (auth: string) =>
      request(app!.getHttpServer()).get('/rl/link').set('Authorization', auth);

    await link(alice).expect(200);
    const limited = await link(alice).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    await link(bob).expect(200);
    // Без входа ручка по-прежнему закрыта: guard лимита не заменяет AuthGuard
    await request(app.getHttpServer()).get('/rl/link').expect(401);
  });

  it('запуск генерации курса: свой часовой счётчик, отдельный от вызовов ИИ', async () => {
    app = await createApp({
      RATE_LIMIT_ENABLED: '1',
      RATE_LIMIT_GENERATION_PER_HOUR: '1',
      RATE_LIMIT_AI_PER_MIN: '5',
    });
    const alice = await bearerFor(app, { userId: '00000000-0000-7000-8000-0000000000a1' });
    const call = (path: string) =>
      request(app!.getHttpServer()).get(path).set('Authorization', alice);

    await call('/rl/generation').expect(200);
    const limited = await call('/rl/generation').expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(3600);
    // Лимит генерации не съедает лимит обычных вызовов ИИ
    await call('/rl/ai').expect(200);
  });

  it('в NODE_ENV=test без RATE_LIMIT_ENABLED лимит выключен', async () => {
    app = await createApp({ RATE_LIMIT_AUTH_PER_MIN: '1' });
    for (let i = 0; i < 3; i += 1) await request(app.getHttpServer()).get('/rl/login').expect(200);
    expect(isRateLimitEnabled({ NODE_ENV: 'production', RATE_LIMIT_ENABLED: undefined })).toBe(
      true,
    );
    expect(isRateLimitEnabled({ NODE_ENV: 'production', RATE_LIMIT_ENABLED: false })).toBe(false);
  });

  it('clientIp: последний адрес X-Forwarded-For, без заголовка — адрес сокета', () => {
    const socket = { remoteAddress: '127.0.0.1' } as never;
    expect(clientIp({ headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8 ' }, socket })).toBe(
      '5.6.7.8',
    );
    expect(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9' }, socket })).toBe('9.9.9.9');
    expect(clientIp({ headers: { 'x-forwarded-for': '' }, socket })).toBe('127.0.0.1');
    expect(clientIp({ headers: {}, socket })).toBe('127.0.0.1');
  });
});

describe('ручки под лимитом', () => {
  const bucketOf = (target: object, method: string) =>
    Reflect.getMetadata(RATE_LIMIT_KEY, (target as Record<string, unknown>)[method] as object);

  it('вход, привязка ребёнка, вызовы ИИ и запуск генерации курса помечены своей группой', () => {
    const expected: Array<[object, string, string]> = [
      [AuthController.prototype, 'loginMax', 'auth'],
      [AuthController.prototype, 'loginDev', 'auth'],
      [AuthController.prototype, 'refresh', 'auth'],
      [ChildrenController.prototype, 'link', 'link'],
      [ChildrenController.prototype, 'acceptInvite', 'link'],
      [AiStreamController.prototype, 'tutorMessage', 'ai'],
      [AiStreamController.prototype, 'parentTutorMessage', 'ai'],
      [AiStreamController.prototype, 'onboardingMessage', 'ai'],
      [AiController.prototype, 'getOnboardingRecommendations', 'ai'],
      [CourseBuilderController.prototype, 'create', 'generation'],
    ];
    for (const [target, method, bucket] of expected)
      expect({ method, bucket: bucketOf(target, method) }).toEqual({ method, bucket });
  });
});
