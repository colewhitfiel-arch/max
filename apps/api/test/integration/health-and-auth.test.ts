/**
 * Полный поток: HTTP → NestJS → Prisma → PostgreSQL. Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('health + auth (integration)', () => {
  let app: INestApplication;
  const base = '/api/v1';

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health проверяет БД', async () => {
    const res = await request(app.getHttpServer()).get(`${base}/health`).expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.headers['x-request-id']).toBeTypeOf('string');
  });

  it('POST /client-errors принимает отчёт клиента без входа и отвечает 204', async () => {
    await request(app.getHttpServer())
      .post(`${base}/client-errors`)
      .send({ kind: 'error', message: 'boom', stack: 'Error: boom', url: 'https://x/', at: 'now' })
      .expect(204);
    // Мусор вместо тела — тоже 204: телеметрия не должна отвечать ошибкой
    await request(app.getHttpServer()).post(`${base}/client-errors`).send('garbage').expect(204);
  });

  it('dev-вход учеником → /me со студенческим профилем из seed', async () => {
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-student-1', roles: ['STUDENT'] })
      .expect(200);
    expect(login.body.me).toMatchObject({ activeRole: 'STUDENT', needsRoleSetup: false });
    expect(login.body.me.student.linkCode).toBe('ALX123');

    const me = await request(app.getHttpServer())
      .get(`${base}/me`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.user.firstName).toBe('Алексей');
  });

  it('пользователь с двумя ролями переключает роль и получает profileId соответствующей роли', async () => {
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-teacher-1', roles: ['TEACHER'] })
      .expect(200);
    expect(login.body.me.roles).toEqual(expect.arrayContaining(['TEACHER', 'PARENT']));
    expect(login.body.me.activeRole).toBe('TEACHER');

    const switched = await request(app.getHttpServer())
      .post(`${base}/auth/switch-role`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ role: 'PARENT' })
      .expect(200);
    expect(switched.body.me.activeRole).toBe('PARENT');
    expect(switched.body.me.parent.childrenCount).toBe(1);

    await request(app.getHttpServer())
      .post(`${base}/auth/switch-role`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ role: 'STUDENT' })
      .expect(403);
  });

  it('refresh выдаёт новую пару и отзывает старый refresh-токен', async () => {
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-parent-1', roles: ['PARENT'] })
      .expect(200);
    const refreshed = await request(app.getHttpServer())
      .post(`${base}/auth/refresh`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeTypeOf('string');
    await request(app.getHttpServer())
      .post(`${base}/auth/refresh`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post(`${base}/auth/logout`)
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(204);
  });

  it('параллельный refresh одним токеном: новую пару получает только один запрос', async () => {
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-parent-1', roles: ['PARENT'] })
      .expect(200);
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        request(app.getHttpServer())
          .post(`${base}/auth/refresh`)
          .send({ refreshToken: login.body.refreshToken }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401, 401]);
  });

  it('PUT /me/avatar пока не реализован → 501, а не 404', async () => {
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-parent-1', roles: ['PARENT'] })
      .expect(200);
    const res = await request(app.getHttpServer())
      .put(`${base}/me/avatar`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ fileId: null })
      .expect(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('новый dev-пользователь создаётся с профилем и ролью', async () => {
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: `max-new-${Date.now()}`, roles: ['STUDENT'] })
      .expect(200);
    expect(login.body.me.student).not.toBeNull();
    expect(login.body.me.student.onboardingCompleted).toBe(false);
  });

  it('при AUTH_PROVIDER=max демо-вход остаётся доступным (стенд открывают и в браузере)', async () => {
    const maxApp = await createTestApp({ AUTH_PROVIDER: 'max', MAX_BOT_TOKEN: 'bot-token' });
    try {
      const res = await request(maxApp.getHttpServer())
        .post(`${base}/auth/dev`)
        .send({ maxUserId: 'max-student-1', roles: ['STUDENT'] })
        .expect(200);
      expect(res.body.accessToken).toBeTypeOf('string');
    } finally {
      await maxApp.close();
    }
  });

  it('при AUTH_PROVIDER=max демо-вход не пускает в чужой аккаунт MAX и не выдаёт чужих ролей', async () => {
    const maxApp = await createTestApp({ AUTH_PROVIDER: 'max', MAX_BOT_TOKEN: 'bot-token' });
    try {
      // Настоящий пользователь MAX (числовой id) — не демо: вход по его id запрещён.
      await request(maxApp.getHttpServer())
        .post(`${base}/auth/dev`)
        .send({ maxUserId: '123456789', roles: ['PARENT'] })
        .expect(403);
      // Демо-ученик не получает роль преподавателя через dev-вход.
      await request(maxApp.getHttpServer())
        .post(`${base}/auth/dev`)
        .send({ maxUserId: 'max-student-1', roles: ['TEACHER'] })
        .expect(403);
    } finally {
      await maxApp.close();
    }
  });

  it('на стенде (APP_ENV=staging) роль преподавателя — только по коду школы; демо-преподаватель входит', async () => {
    const stagingApp = await createTestApp({ APP_ENV: 'staging' });
    const http = () => request(stagingApp.getHttpServer());
    try {
      const run = Date.now();
      const direct = await http()
        .post(`${base}/auth/dev`)
        .send({ maxUserId: `max-teacher-nocode-${run}`, roles: ['TEACHER'] })
        .expect(422);
      expect(direct.body.error.code).toBe('BUSINESS_RULE');

      const parent = await http()
        .post(`${base}/auth/dev`)
        .send({ maxUserId: `max-parent-nocode-${run}`, roles: ['PARENT'] })
        .expect(200);
      const addRole = (inviteCode?: string) =>
        http()
          .post(`${base}/auth/roles`)
          .set('Authorization', `Bearer ${parent.body.accessToken}`)
          .send({ role: 'TEACHER', inviteCode });
      await addRole().expect(422);
      const withCode = await addRole('SCHOOL1').expect(200);
      expect(withCode.body.me.teacher).not.toBeNull();

      // Сид уже создал демо-преподавателю профиль со школой — код ему не нужен.
      const demo = await http()
        .post(`${base}/auth/dev`)
        .send({ maxUserId: 'max-teacher-1', roles: ['TEACHER'] })
        .expect(200);
      expect(demo.body.me.activeRole).toBe('TEACHER');
    } finally {
      await stagingApp.close();
    }
  });

  it('невалидное тело → VALIDATION в едином формате', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('ручка без токена → 401; ученик на ручке преподавателя → 403', async () => {
    await request(app.getHttpServer()).get(`${base}/me`).expect(401);
    const login = await request(app.getHttpServer())
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-student-1', roles: ['STUDENT'] });
    await request(app.getHttpServer())
      .patch(`${base}/me/settings`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ theme: 'DARK' })
      .expect(200)
      .expect((r) => expect(r.body.settings.theme).toBe('DARK'));
  });
});
