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
      .send({ selectedClubIds: [DEMO_IDS.clubs.robotics], profileDraft: done!.profileDraft })
      .expect(200);
    expect(me.body.student.onboardingCompleted).toBe(true);

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
