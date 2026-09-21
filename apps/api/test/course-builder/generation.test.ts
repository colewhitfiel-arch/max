/**
 * Интеграция: режим «по теме без конспекта» → пайплайн на mock-провайдере → READY → accept → Course.
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { JOB_QUEUE } from '../../src/common/queue/job-queue';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('course-builder (integration, mock AI)', () => {
  let app: INestApplication;
  let token = '';
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    const login = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-teacher-1', roles: ['TEACHER'] })
      .expect(200);
    token = login.body.accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  const drain = () => (app.get(JOB_QUEUE) as InlineJobQueue).drain();

  it('без файлов и темы → VALIDATION', async () => {
    const res = await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: DEMO_IDS.groups.programmingA })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('чужая группа → 403', async () => {
    const student = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId: `max-teacher-other-${Date.now()}`, roles: ['TEACHER'] })
      .expect(200);
    await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${student.body.accessToken}`)
      .send({
        groupId: DEMO_IDS.groups.programmingA,
        topic: 'Циклы в Python: практика для 7 класса',
      })
      .expect(403);
  });

  it('тема → атомы → узлы → уроки → READY → accept создаёт курс DRAFT', async () => {
    const created = await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        groupId: DEMO_IDS.groups.programmingA,
        topic: 'Циклы в Python: for и while, практика на списках для 7 класса',
        instructions: 'Больше практики',
        targetTitle: 'Циклы в Python',
      })
      .expect(200);
    expect(created.body).toMatchObject({ stage: 'QUEUED', sourceKind: 'TOPIC', materials: [] });

    await drain();

    const job = await http()
      .get(`${base}/teacher/course-builder/jobs/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(job.body.stage).toBe('READY');
    expect(job.body.progress).toBe(100);
    expect(job.body.knowledge.atoms.length).toBeGreaterThan(5);
    expect(job.body.knowledge.nodes.length).toBeGreaterThan(1);
    expect(job.body.knowledge.stats.coverage).toBeGreaterThan(0);
    expect(job.body.knowledge.plan.length).toBe(job.body.draft.modules.length);
    expect(job.body.draft.title).toBe('Циклы в Python');
    const types = job.body.draft.modules.flatMap((m: { blocks: Array<{ type: string }> }) =>
      m.blocks.map((b) => b.type),
    );
    expect(types).toEqual(expect.arrayContaining(['TEXT', 'QUIZ', 'INTERACTIVE', 'PRACTICE']));

    const list = await http()
      .get(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.items.some((j: { id: string }) => j.id === created.body.id)).toBe(true);
    expect(list.body.items[0].draft).toBeUndefined();

    const accepted = await http()
      .post(`${base}/teacher/course-builder/jobs/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(accepted.body.courseId).toBeTypeOf('string');

    const after = await http()
      .get(`${base}/teacher/course-builder/jobs/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body).toMatchObject({ stage: 'ACCEPTED', courseId: accepted.body.courseId });

    await http()
      .post(`${base}/teacher/course-builder/jobs/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('файл txt: upload-url → PUT → confirm → генерация из материала', async () => {
    const upload = await http()
      .post(`${base}/files/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'конспект.md', mime: 'text/markdown', sizeBytes: 500, purpose: 'MATERIAL' })
      .expect(200);
    const text = [
      '# Датчики Arduino',
      '',
      'Ультразвуковой датчик HC-SR04 измеряет расстояние по времени между посылкой и приёмом звукового импульса.',
      '',
      'Датчик подключается четырьмя проводами: питание 5 В, земля, Trig и Echo к цифровым пинам платы.',
      '',
      'Функция pulseIn измеряет длительность импульса на пине Echo в микросекундах.',
      '',
      'Расстояние в сантиметрах равно длительности импульса, делённой на 58.',
    ].join('\n');
    const url = new URL(upload.body.uploadUrl);
    await http().put(url.pathname).set('Content-Type', 'text/markdown').send(text).expect(204);
    const confirmed = await http()
      .post(`${base}/files/${upload.body.fileId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(confirmed.body.url).toContain('/files/local/');

    const created = await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: DEMO_IDS.groups.roboticsA, materialIds: [upload.body.fileId] })
      .expect(200);
    expect(created.body.sourceKind).toBe('MATERIALS');
    expect(created.body.materials[0].fileName).toBe('конспект.md');
    await drain();

    const job = await http()
      .get(`${base}/teacher/course-builder/jobs/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(job.body.stage).toBe('READY');
    expect(job.body.draft.title).toBe('Датчики Arduino');
    expect(job.body.knowledge.atoms[0].source).toBe('конспект.md');
  });
});
