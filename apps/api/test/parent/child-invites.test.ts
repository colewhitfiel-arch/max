/**
 * Интеграция: ссылка-приглашение ребёнка от создания до появления ребёнка у родителя
 * (docs/07 F14): диплинк MAX, принятие, связь в БД, повтор, чужое, истёкшее и неверное
 * приглашение. Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { parseChildInviteStartParam } from '@edu/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

const base = '/api/v1';
/** Уникальные maxUserId на прогон: тестовая БД общая, сценарии не должны видеть прошлые данные. */
const run = Date.now().toString(36);

type Role = 'TEACHER' | 'STUDENT' | 'PARENT';

describe.skipIf(!hasTestDatabase)('приглашение ребёнка по ссылке (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  const login = async (maxUserId: string, roles: Role[]) => {
    const res = await http().post(`${base}/auth/dev`).send({ maxUserId, roles }).expect(200);
    return {
      token: res.body.accessToken as string,
      /** Профиль ученика (`me.student.id`); у родителя без роли ученика — null. */
      studentId: (res.body.me.student?.id ?? null) as string | null,
    };
  };
  const createInvite = async (parentToken: string) =>
    (
      await http()
        .post(`${base}/parent/children/invites`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send()
        .expect(200)
    ).body as { token: string; url: string; expiresAt: string };
  const accept = (token: string, studentToken: string) =>
    http()
      .post(`${base}/student/parent-invites/${token}/accept`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send();
  const view = (token: string, studentToken: string) =>
    http()
      .get(`${base}/student/parent-invites/${token}`)
      .set('Authorization', `Bearer ${studentToken}`);
  const childrenOf = async (parentToken: string) =>
    (
      await http()
        .get(`${base}/parent/children`)
        .set('Authorization', `Bearer ${parentToken}`)
        .expect(200)
    ).body.items as Array<{ student: { id: string }; linkStatus: string }>;

  beforeAll(async () => {
    app = await createTestApp({ MAX_BOT_NAME: '@edu_kruzhki_bot', WEB_URL: 'https://edu.example' });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('ссылка — диплинк мини-приложения MAX с токеном в startapp', async () => {
    const parent = await login(`max-inv-parent-url-${run}`, ['PARENT']);
    const invite = await createInvite(parent.token);

    const url = new URL(invite.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://max.ru/edu_kruzhki_bot');
    expect(url.searchParams.get('startapp')).toBe(`invite_${invite.token}`);
    // MAX: в startapp только латиница, цифры, `_` и `-`, до 512 символов.
    expect(url.searchParams.get('startapp')).toMatch(/^[A-Za-z0-9_-]{1,512}$/);
    expect(parseChildInviteStartParam(url.searchParams.get('startapp'))).toBe(invite.token);
    expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('полный сценарий: создание → ребёнок принимает → связь ACTIVE в БД → ребёнок у родителя', async () => {
    const parent = await login(`max-inv-parent-${run}`, ['PARENT']);
    const child = await login(`max-inv-child-${run}`, ['STUDENT']);
    const childId = child.studentId!;
    expect(await childrenOf(parent.token)).toEqual([]);

    const invite = await createInvite(parent.token);

    const seen = await view(invite.token, child.token).expect(200);
    expect(seen.body).toMatchObject({
      token: invite.token,
      status: 'PENDING',
      alreadyLinked: false,
    });
    expect(seen.body.parent.firstName).toBeTruthy();

    const accepted = await accept(invite.token, child.token).expect(200);
    expect(accepted.body.linkStatus).toBe('ACTIVE');

    // В БД: связь ACTIVE с датой подтверждения, токен погашен этим учеником.
    const stored = await prisma.parentInvite.findUniqueOrThrow({
      where: { token: invite.token },
      select: { parentId: true, acceptedAt: true, acceptedBy: true },
    });
    expect(stored.acceptedAt).not.toBeNull();
    expect(stored.acceptedBy).toBe(childId);
    const link = await prisma.parentStudentLink.findUniqueOrThrow({
      where: { parentId_studentId: { parentId: stored.parentId, studentId: childId } },
    });
    expect(link.status).toBe('ACTIVE');
    expect(link.confirmedAt).not.toBeNull();

    // Родитель видит ребёнка и получает его данные (policy пропускает).
    const children = await childrenOf(parent.token);
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ student: { id: childId }, linkStatus: 'ACTIVE' });
    await http()
      .get(`${base}/parent/children/${childId}/home`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    // Повтор тем же учеником — тот же результат, статус приглашения ACCEPTED.
    await accept(invite.token, child.token).expect(200);
    expect((await view(invite.token, child.token).expect(200)).body.status).toBe('ACCEPTED');
    expect(await childrenOf(parent.token)).toHaveLength(1);

    // Ссылка одноразовая: другой ученик получает конфликт и не привязывается.
    const stranger = await login(`max-inv-stranger-${run}`, ['STUDENT']);
    const conflict = await accept(invite.token, stranger.token).expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
    expect(await childrenOf(parent.token)).toHaveLength(1);
  });

  it('уже привязанный ребёнок: CONFLICT, а ссылка остаётся действующей для другого ребёнка', async () => {
    const parent = await login(`max-inv-parent-linked-${run}`, ['PARENT']);
    const first = await login(`max-inv-first-${run}`, ['STUDENT']);
    await accept((await createInvite(parent.token)).token, first.token).expect(200);

    const second = await createInvite(parent.token);
    expect((await view(second.token, first.token).expect(200)).body.alreadyLinked).toBe(true);
    const conflict = await accept(second.token, first.token).expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');

    const sibling = await login(`max-inv-sibling-${run}`, ['STUDENT']);
    await accept(second.token, sibling.token).expect(200);
    const ids = (await childrenOf(parent.token)).map((item) => item.student.id).sort();
    expect(ids).toEqual([first.studentId, sibling.studentId].sort());
  });

  it('гонка: двое по одной ссылке одновременно — привязывается ровно один', async () => {
    const parent = await login(`max-inv-parent-race-${run}`, ['PARENT']);
    const a = await login(`max-inv-race-a-${run}`, ['STUDENT']);
    const b = await login(`max-inv-race-b-${run}`, ['STUDENT']);
    const invite = await createInvite(parent.token);

    const statuses = (
      await Promise.all([accept(invite.token, a.token), accept(invite.token, b.token)])
    ).map((res) => res.status);
    expect(statuses.sort()).toEqual([200, 409]);
    expect(await childrenOf(parent.token)).toHaveLength(1);

    // Двойное нажатие одним учеником — оба ответа успешные.
    const again = await createInvite(parent.token);
    const c = await login(`max-inv-race-c-${run}`, ['STUDENT']);
    const twice = await Promise.all([accept(again.token, c.token), accept(again.token, c.token)]);
    expect(twice.map((res) => res.status)).toEqual([200, 200]);
    expect(await childrenOf(parent.token)).toHaveLength(2);
  });

  it('отвязанного ребёнка привязывает только новое приглашение, не старое', async () => {
    const parent = await login(`max-inv-parent-revoked-${run}`, ['PARENT']);
    const child = await login(`max-inv-revoked-${run}`, ['STUDENT']);
    const childId = child.studentId;
    const used = await createInvite(parent.token);
    await accept(used.token, child.token).expect(200);
    await http()
      .delete(`${base}/parent/children/${childId}`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send()
      .expect(204);
    expect(await childrenOf(parent.token)).toEqual([]);

    // Погашенная ссылка отвязанного ребёнка обратно не привязывает.
    const reused = await accept(used.token, child.token).expect(422);
    expect(reused.body.error.code).toBe('BUSINESS_RULE');
    expect(await childrenOf(parent.token)).toEqual([]);

    await accept((await createInvite(parent.token)).token, child.token).expect(200);
    expect(await childrenOf(parent.token)).toMatchObject([
      { student: { id: childId }, linkStatus: 'ACTIVE' },
    ]);
  });

  it('истёкшее приглашение: статус EXPIRED, принять нельзя, связь не создаётся', async () => {
    const parent = await login(`max-inv-parent-expired-${run}`, ['PARENT']);
    const child = await login(`max-inv-expired-${run}`, ['STUDENT']);
    const invite = await createInvite(parent.token);
    await prisma.parentInvite.update({
      where: { token: invite.token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    expect((await view(invite.token, child.token).expect(200)).body.status).toBe('EXPIRED');
    const res = await accept(invite.token, child.token).expect(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
    expect(await childrenOf(parent.token)).toEqual([]);
  });

  it('несуществующее приглашение — NOT_FOUND', async () => {
    const child = await login(`max-inv-404-${run}`, ['STUDENT']);
    const missing = 'nonexistent-token-000000000000';
    expect((await view(missing, child.token).expect(404)).body.error.code).toBe('NOT_FOUND');
    expect((await accept(missing, child.token).expect(404)).body.error.code).toBe('NOT_FOUND');
  });

  it('принять может только ученик; свой же аккаунт привязать к себе нельзя', async () => {
    const parent = await login(`max-inv-parent-self-${run}`, ['PARENT', 'STUDENT']);
    const invite = await createInvite(parent.token);
    await accept(invite.token, parent.token).expect(403);

    const switched = await http()
      .post(`${base}/auth/switch-role`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({ role: 'STUDENT' })
      .expect(200);
    const self = await accept(invite.token, switched.body.accessToken as string).expect(422);
    expect(self.body.error.code).toBe('BUSINESS_RULE');
    const row = await prisma.parentInvite.findUniqueOrThrow({ where: { token: invite.token } });
    expect(row.acceptedAt).toBeNull();
  });

  it('без MAX_BOT_NAME ссылка ведёт на веб-экран /invite/:token', async () => {
    const webApp = await createTestApp({ WEB_URL: 'https://edu.example/' });
    try {
      const res = await request(webApp.getHttpServer())
        .post(`${base}/auth/dev`)
        .send({ maxUserId: `max-inv-parent-web-${run}`, roles: ['PARENT'] })
        .expect(200);
      const invite = await request(webApp.getHttpServer())
        .post(`${base}/parent/children/invites`)
        .set('Authorization', `Bearer ${res.body.accessToken as string}`)
        .send()
        .expect(200);
      expect(invite.body.url).toBe(`https://edu.example/invite/${invite.body.token as string}`);
    } finally {
      await webApp.close();
    }
  });
});
