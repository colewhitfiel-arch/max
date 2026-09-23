/**
 * Интеграция: «Задать ДЗ» — адресное простое задание, сдача и проверка, а также генерация ДЗ
 * одним модулем в уже существующий курс (docs/07 F7, F8).
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { JOB_QUEUE } from '../../src/common/queue/job-queue';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('задания преподавателя (integration, mock AI)', () => {
  let app: INestApplication;
  let teacher = '';
  let alexey = '';
  let dasha = '';
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());
  const drain = () => (app.get(JOB_QUEUE) as InlineJobQueue).drain();

  const loginAs = async (maxUserId: string, role: 'TEACHER' | 'STUDENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs('max-teacher-1', 'TEACHER');
    alexey = await loginAs('max-student-1', 'STUDENT');
    dasha = await loginAs('max-student-2', 'STUDENT');
  });

  afterAll(async () => {
    await app.close();
  });

  it('задание всей группе видят все ученики группы', async () => {
    const created = await http()
      .post(`${base}/teacher/assignments`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        groupId: DEMO_IDS.groups.roboticsA,
        title: 'Прочитать главу про датчики',
        publish: true,
      })
      .expect(200);
    expect(created.body.studentIds).toEqual([]);
    // Без адресатов задание получает весь состав группы (в тестовой БД он общий на все тесты).
    const detail = await http()
      .get(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(created.body.studentsCount).toBe(detail.body.students.length);
    expect(created.body.studentsCount).toBeGreaterThanOrEqual(2);

    for (const token of [alexey, dasha]) {
      const list = await http()
        .get(`${base}/student/assignments`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const ids = list.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(created.body.id);
    }
  });

  it('адресное задание видит только выбранный ученик', async () => {
    const created = await http()
      .post(`${base}/teacher/assignments`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        groupId: DEMO_IDS.groups.roboticsA,
        title: 'Индивидуально: досдать проект',
        studentIds: [DEMO_IDS.students.alexey],
        publish: true,
      })
      .expect(200);
    expect(created.body.studentIds).toEqual([DEMO_IDS.students.alexey]);
    expect(created.body.studentsCount).toBe(1);

    const mine = await http()
      .get(`${base}/student/assignments`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(mine.body.items.map((i: { id: string }) => i.id)).toContain(created.body.id);

    const others = await http()
      .get(`${base}/student/assignments`)
      .set('Authorization', `Bearer ${dasha}`)
      .expect(200);
    expect(others.body.items.map((i: { id: string }) => i.id)).not.toContain(created.body.id);

    // И открыть чужое адресное задание по прямой ссылке тоже нельзя.
    await http()
      .get(`${base}/student/assignments/${created.body.id}`)
      .set('Authorization', `Bearer ${dasha}`)
      .expect(404);

    // В листе сдач у преподавателя — только адресаты.
    const submissions = await http()
      .get(`${base}/teacher/assignments/${created.body.id}/submissions`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(submissions.body.rows.length).toBe(1);
    expect(submissions.body.rows[0].student.id).toBe(DEMO_IDS.students.alexey);
  });

  it('ученик не из группы в адресатах → 422', async () => {
    const res = await http()
      .post(`${base}/teacher/assignments`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        groupId: DEMO_IDS.groups.programmingA,
        title: 'Не тем ученикам',
        studentIds: [DEMO_IDS.students.dasha],
        publish: true,
      })
      .expect(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('сдача идемпотентна по ключу, проверка ставит балл', async () => {
    const created = await http()
      .post(`${base}/teacher/assignments`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        groupId: DEMO_IDS.groups.roboticsA,
        title: 'Схема подключения',
        studentIds: [DEMO_IDS.students.alexey],
        maxScore: 50,
        publish: true,
      })
      .expect(200);

    const key = `key-${Date.now()}`;
    const submit = () =>
      http()
        .post(`${base}/student/assignments/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${alexey}`)
        .set('Idempotency-Key', key)
        .send({ text: 'Схема готова, прикладываю описание.' });

    const first = await submit().expect(200);
    const replay = await submit().expect(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.attemptsCount).toBe(first.body.attemptsCount);

    const graded = await http()
      .post(`${base}/teacher/submissions/${first.body.id}/grade`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({ score: 45, feedback: 'Хорошо, но подпиши выводы', status: 'GRADED' })
      .expect(200);
    expect(graded.body).toMatchObject({ status: 'GRADED', score: 45 });

    // Балл больше максимума — ошибка валидации.
    await http()
      .post(`${base}/teacher/submissions/${first.body.id}/grade`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({ score: 999, status: 'GRADED' })
      .expect(400);
  });

  it('ДЗ по теме: один модуль, дополняет существующий курс и сразу становится заданием', async () => {
    const created = await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        groupId: DEMO_IDS.groups.roboticsA,
        target: 'HOMEWORK',
        targetCourseId: DEMO_IDS.course,
        topic: 'Ультразвуковой датчик HC-SR04: как измерить расстояние и не ошибиться',
        studentIds: [DEMO_IDS.students.alexey],
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(200);
    expect(created.body).toMatchObject({ target: 'HOMEWORK', targetCourseId: DEMO_IDS.course });

    await drain();

    const job = await http()
      .get(`${base}/teacher/course-builder/jobs/${created.body.id}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(job.body.stage).toBe('READY');
    // ДЗ — ровно один модуль, а не курс из нескольких.
    expect(job.body.draft.modules.length).toBe(1);

    const before = await http()
      .get(`${base}/teacher/courses/${DEMO_IDS.course}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);

    const accepted = await http()
      .post(`${base}/teacher/course-builder/jobs/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(accepted.body.courseId).toBe(DEMO_IDS.course);
    expect(accepted.body.assignmentsCreated).toBeGreaterThan(0);

    // Курс тот же, но в нём стало больше модулей — ученик продолжает проходить его же.
    const after = await http()
      .get(`${base}/teacher/courses/${DEMO_IDS.course}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(after.body.modules.length).toBe(before.body.modules.length + 1);

    // Задания нового модуля адресованы только выбранному ученику.
    const mine = await http()
      .get(`${base}/student/assignments`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    const hers = await http()
      .get(`${base}/student/assignments`)
      .set('Authorization', `Bearer ${dasha}`)
      .expect(200);
    expect(mine.body.items.length).toBeGreaterThan(hers.body.items.length);

    // Повторный accept идемпотентен: новых модулей и заданий не появляется.
    const again = await http()
      .post(`${base}/teacher/course-builder/jobs/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(again.body.courseId).toBe(DEMO_IDS.course);
    expect(again.body.assignmentsCreated).toBe(0);
    const final = await http()
      .get(`${base}/teacher/courses/${DEMO_IDS.course}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(final.body.modules.length).toBe(after.body.modules.length);
  });

  it('дополнить чужой курс нельзя', async () => {
    const other = await loginAs(`max-teacher-alien-${Date.now()}`, 'TEACHER');
    await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set('Authorization', `Bearer ${other}`)
      .send({
        groupId: DEMO_IDS.groups.roboticsA,
        target: 'HOMEWORK',
        targetCourseId: DEMO_IDS.course,
        topic: 'Попытка дополнить чужой курс своим домашним заданием',
      })
      .expect(403);
  });

  it('группы преподавателя и состав группы — для выбора адресатов', async () => {
    const groups = await http()
      .get(`${base}/teacher/groups`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(groups.body.items.length).toBeGreaterThan(0);

    const detail = await http()
      .get(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(detail.body.students.map((row: { student: { id: string } }) => row.student.id)).toEqual(
      expect.arrayContaining([DEMO_IDS.students.alexey, DEMO_IDS.students.dasha]),
    );
  });
});
