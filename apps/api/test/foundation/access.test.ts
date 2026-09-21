import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CurrentUser, Public, RequirePermission, Roles } from '../../src/common/auth/decorators';
import type { AuthUser } from '../../src/common/auth/auth-user';
import { bearerFor, createMiniApp } from '../helpers/mini-app';

@Controller('t')
class AccessTestController {
  @Public()
  @Get('public')
  pub() {
    return { ok: true };
  }

  @Get('user')
  user(@CurrentUser() user: AuthUser) {
    return { userId: user.userId, role: user.activeRole };
  }

  @Roles('TEACHER')
  @Get('teacher-only')
  teacherOnly() {
    return { ok: true };
  }

  @RequirePermission('parent:payments.pay')
  @Get('pay')
  pay() {
    return { ok: true };
  }
}

describe('auth + access guards', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createMiniApp([AccessTestController]);
  });
  afterAll(async () => {
    await app.close();
  });

  it('публичная ручка доступна без токена', async () => {
    await request(app.getHttpServer()).get('/t/public').expect(200, { ok: true });
  });

  it('защищённая ручка без токена → 401 в едином формате', async () => {
    const res = await request(app.getHttpServer()).get('/t/user').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeTypeOf('string');
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('валидный токен → пользователь в запросе', async () => {
    const res = await request(app.getHttpServer())
      .get('/t/user')
      .set('Authorization', await bearerFor(app))
      .expect(200);
    expect(res.body).toEqual({ userId: '00000000-0000-7000-8000-000000000011', role: 'STUDENT' });
  });

  it('@Roles: чужая роль → 403', async () => {
    await request(app.getHttpServer())
      .get('/t/teacher-only')
      .set('Authorization', await bearerFor(app, { activeRole: 'STUDENT' }))
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('FORBIDDEN'));
    await request(app.getHttpServer())
      .get('/t/teacher-only')
      .set('Authorization', await bearerFor(app, { roles: ['TEACHER'], activeRole: 'TEACHER' }))
      .expect(200);
  });

  it('@RequirePermission: по ROLE_PERMISSIONS', async () => {
    await request(app.getHttpServer())
      .get('/t/pay')
      .set('Authorization', await bearerFor(app, { activeRole: 'STUDENT' }))
      .expect(403);
    await request(app.getHttpServer())
      .get('/t/pay')
      .set('Authorization', await bearerFor(app, { roles: ['PARENT'], activeRole: 'PARENT' }))
      .expect(200);
  });

  it('входящий X-Request-Id пробрасывается в ответ', async () => {
    const res = await request(app.getHttpServer())
      .get('/t/public')
      .set('X-Request-Id', 'abc-123')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});
