/**
 * Лимит частоты на настоящем приложении: ручка входа (ts-rest) под RateLimitGuard, счётчик —
 * в Postgres (KV_DRIVER=postgres, как на serverless-стенде). Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('rate limit (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({
      KV_DRIVER: 'postgres',
      RATE_LIMIT_ENABLED: '1',
      RATE_LIMIT_AUTH_PER_MIN: '2',
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('демо-вход сверх лимита с одного IP — 429 RATE_LIMITED', async () => {
    // Свой «IP» на прогон: счётчики в тестовой БД переживают прошлые запуски
    const ip = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const login = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/dev')
        .set('X-Forwarded-For', ip)
        .send({ maxUserId: 'max-student-1', roles: ['STUDENT'] });
    await login().expect(200);
    await login().expect(200);
    const limited = await login().expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
