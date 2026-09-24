/**
 * Интеграция ИИ-слоя на mock-провайдере: тьютор (SSE), онбординг с рекомендациями и зачислением,
 * траектория через очередь. Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { JOB_QUEUE } from '../../src/common/queue/job-queue';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()) as Record<string, unknown>);
}

describe.skipIf(!hasTestDatabase)('ai (integration, mock AI)', () => {
  let app: INestApplication;
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());
  const drain = () => (app.get(JOB_QUEUE) as InlineJobQueue).drain();

  const login = async (maxUserId: string) => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: ['STUDENT'] })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('тьютор: история отдаётся с конца, курсор ведёт к старым; мусорный курсор и id → 400', async () => {
    const token = await login('max-student-1');
    const created = await http()
      .post(`${base}/ai/conversations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'TUTOR' })
      .expect(200);
    await http()
      .post(`${base}/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Привет' })
      .expect(200);

    const url = `${base}/ai/conversations/${created.body.id}/messages`;
    const first = await http()
      .get(`${url}?limit=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.items.map((m: { role: string }) => m.role)).toEqual(['ASSISTANT']);
    expect(first.body.nextCursor).toBeTypeOf('string');
    const older = await http()
      .get(`${url}?limit=1&cursor=${first.body.nextCursor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(older.body.items.map((m: { role: string }) => m.role)).toEqual(['USER']);

    const junk = Buffer.from(JSON.stringify({ x: 1 })).toString('base64url');
    await http().get(`${url}?cursor=${junk}`).set('Authorization', `Bearer ${token}`).expect(400);
    await http()
      .post(`${base}/ai/conversations/not-a-uuid/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Привет' })
      .expect(400);
  });

  it('тьютор: диалог, SSE-ответ с контекстом, история', async () => {
    const token = await login('max-student-1');
    const created = await http()
      .post(`${base}/ai/conversations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'TUTOR' })
      .expect(200);

    const stream = await http()
      .post(`${base}/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Что мне сегодня нужно сделать?' })
      .expect(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(stream.text);
    expect(events.some((e) => e.type === 'token')).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ type: 'done' });

    const messages = await http()
      .get(`${base}/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(messages.body.items.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT']);
    expect(messages.body.items[1].content).toContain('сегодня');

    const list = await http()
      .get(`${base}/ai/conversations?kind=TUTOR`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: created.body.id,
      title: 'Что мне сегодня нужно сделать?',
    });

    // чужой диалог → 404
    const other = await login(`max-student-x-${Date.now()}`);
    await http()
      .post(`${base}/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', `Bearer ${other}`)
      .send({ text: 'Привет' })
      .expect(404);
  });

  it('онбординг: диалог до завершения → рекомендации → complete зачисляет и строит траекторию', async () => {
    const token = await login(`max-student-new-${Date.now()}`);
    const start = await http()
      .post(`${base}/student/onboarding/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(start.body.message.role).toBe('ASSISTANT');

    const answers = [
      'Люблю собирать роботов и играть в игры',
      'Информатика и физика',
      'Часа четыре в неделю',
      'Потом хочу попробовать шахматы',
    ];
    let done: Record<string, unknown> | undefined;
    for (const text of answers) {
      const res = await http()
        .post(`${base}/student/onboarding/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ conversationId: start.body.conversationId, text })
        .expect(200);
      const events = parseSse(res.text);
      done = events[events.length - 1];
    }
    expect(done).toMatchObject({ type: 'done', isComplete: true });
    expect(done?.profileDraft).toBeTruthy();

    const recs = await http()
      .get(`${base}/student/onboarding/recommendations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(recs.body.items.length).toBeGreaterThan(0);
    expect(recs.body.items[0].club.id).toBeTypeOf('string');
    expect(recs.body.items[0].reason).toBeTypeOf('string');

    const me = await http()
      .post(`${base}/student/onboarding/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        selectedClubIds: [DEMO_IDS.clubs.robotics],
        laterClubIds: [DEMO_IDS.clubs.programming],
        profileDraft: done!.profileDraft,
      })
      .expect(200);
    expect(me.body.student.onboardingCompleted).toBe(true);

    // диалог знакомства стал чатом с тьютором: тот же id, итоговая реплика про «сейчас/позже»
    const tutorChats = await http()
      .get(`${base}/ai/conversations?kind=TUTOR`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tutorChats.body.items.map((c: { id: string }) => c.id)).toContain(
      start.body.conversationId,
    );
    const history = await http()
      .get(`${base}/ai/conversations/${start.body.conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const last = history.body.items.at(-1);
    expect(last.role).toBe('ASSISTANT');
    expect(last.content).toContain('Записал тебя');
    expect(last.content).toContain('На будущее запомнил');

    // преподаватель школы видит спрос: 1 записался в робототехнику, 1 хочет программирование позже
    const teacher = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-teacher-1', roles: ['TEACHER'] })
      .expect(200);
    const demand = await http()
      .get(`${base}/teacher/clubs/demand`)
      .set('Authorization', `Bearer ${teacher.body.accessToken}`)
      .expect(200);
    expect(demand.body.students).toBeGreaterThanOrEqual(1);
    const byClub = new Map(demand.body.items.map((i: { club: { id: string } }) => [i.club.id, i]));
    expect(byClub.get(DEMO_IDS.clubs.robotics)).toMatchObject({ chosen: expect.any(Number) });
    expect(
      (byClub.get(DEMO_IDS.clubs.robotics) as { chosen: number }).chosen,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (byClub.get(DEMO_IDS.clubs.programming) as { later: number }).later,
    ).toBeGreaterThanOrEqual(1);
    expect(
      demand.body.futureInterests.some((f: { label: string }) => /шахматы/i.test(f.label)),
    ).toBe(true);
    // ученику нельзя
    await http()
      .get(`${base}/teacher/clubs/demand`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await drain();
    const trajectory = await http()
      .get(`${base}/student/trajectory`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(trajectory.body).not.toBeNull();
    expect(trajectory.body.content.summary).toBeTypeOf('string');
    expect(trajectory.body.content.recommendations.length).toBeGreaterThan(0);

    // повторный ручной пересчёт в те же сутки → 429
    await http()
      .post(`${base}/student/trajectory/refresh`)
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
    await http()
      .post(`${base}/student/trajectory/refresh`)
      .set('Authorization', `Bearer ${token}`)
      .expect(429);
    await drain();
  });
});
