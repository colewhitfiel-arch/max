/**
 * Интеграция: режим «по теме без конспекта» → пайплайн на mock-провайдере → READY → accept → Course.
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { JOB_QUEUE } from '../../src/common/queue/job-queue';
import { CourseBuilderService } from '../../src/modules/course-builder/course-builder.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('course-builder (integration, mock AI)', () => {
  let app: INestApplication;
  let token = '';
  let teacherId = '';
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    const login = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId: 'max-teacher-1', roles: ['TEACHER'] })
      .expect(200);
    token = login.body.accessToken;
    teacherId = login.body.me.teacher.id;
  });

  const uploadUrl = async (fileName: string, mime: string, sizeBytes: number) => {
    const res = await http()
      .post(`${base}/files/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName, mime, sizeBytes, purpose: 'MATERIAL' })
      .expect(200);
    return { fileId: res.body.fileId as string, path: new URL(res.body.uploadUrl).pathname };
  };
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
      .send({
        fileName: 'конспект.md',
        mime: 'text/markdown',
        sizeBytes: 1000,
        purpose: 'MATERIAL',
      })
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

  it('локальная загрузка сверяет размер и тип с токеном; скачивание — с Content-Type и nosniff', async () => {
    const big = await uploadUrl('big.txt', 'text/plain', 10);
    await http()
      .put(big.path)
      .set('Content-Type', 'text/plain')
      .send('это явно длиннее десяти байт')
      .expect(400);
    await http()
      .post(`${base}/files/${big.fileId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);

    const wrongType = await uploadUrl('page.txt', 'text/plain', 100);
    await http().put(wrongType.path).set('Content-Type', 'text/html').send('<b>x</b>').expect(400);

    const ok = await uploadUrl('ok.txt', 'text/plain', 100);
    await http().put(ok.path).set('Content-Type', 'text/plain').send('привет').expect(204);
    const confirmed = await http()
      .post(`${base}/files/${ok.fileId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const download = await http().get(new URL(confirmed.body.url).pathname).expect(200);
    expect(download.headers['content-type']).toContain('text/plain');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('материал, из которого текст не извлекается (png), отклоняется сразу — 422', async () => {
    const png = await uploadUrl('схема.png', 'image/png', 100);
    await http()
      .put(png.path)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('png'))
      .expect(204);
    await http()
      .post(`${base}/files/${png.fileId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: DEMO_IDS.groups.roboticsA, materialIds: [png.fileId] })
      .expect(422);
  });

  it('сторож переводит зависшую задачу в FAILED, отменённую не трогает', async () => {
    const prisma = app.get(PrismaService);
    const stuck = await prisma.courseGenerationJob.create({
      data: {
        teacherId,
        groupId: DEMO_IDS.groups.programmingA,
        topic: 'x',
        sourceKind: 'TOPIC',
        stage: 'GENERATING',
        startedAt: new Date(),
      },
    });
    const cancelled = await prisma.courseGenerationJob.create({
      data: {
        teacherId,
        groupId: DEMO_IDS.groups.programmingA,
        topic: 'x',
        sourceKind: 'TOPIC',
        stage: 'CANCELLED',
      },
    });
    const later = new Date(Date.now() + 60 * 60 * 1000);
    expect(await app.get(CourseBuilderService).failStaleJobs(later)).toBeGreaterThanOrEqual(1);
    const [a, b] = await Promise.all([
      prisma.courseGenerationJob.findUnique({ where: { id: stuck.id } }),
      prisma.courseGenerationJob.findUnique({ where: { id: cancelled.id } }),
    ]);
    expect(a?.stage).toBe('FAILED');
    expect(a?.error).toBeTypeOf('string');
    expect(b?.stage).toBe('CANCELLED');
  });
});
