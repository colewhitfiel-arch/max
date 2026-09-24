/**
 * Интеграция: лист посещаемости занятия и отметка (docs/07 F6).
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('attendance (integration)', () => {
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

  const lessonId = DEMO_IDS.lessons.roboticsToday;

  it('лист занятия: все зачисленные ученики группы', async () => {
    const res = await http()
      .get(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.lesson.id).toBe(lessonId);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(2);
    const ids = res.body.rows.map((row: { student: { id: string } }) => row.student.id);
    expect(ids).toEqual(
      expect.arrayContaining([DEMO_IDS.students.alexey, DEMO_IDS.students.dasha]),
    );
  });

  it('отметка: upsert строк, занятие → DONE, повтор идемпотентен', async () => {
    const body = {
      rows: [
        { studentId: DEMO_IDS.students.alexey, status: 'PRESENT' },
        { studentId: DEMO_IDS.students.dasha, status: 'LATE', comment: 'Опоздала на 10 минут' },
      ],
    };
    const marked = await http()
      .put(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(marked.body.lesson.status).toBe('DONE');
    const byStudent = new Map(
      marked.body.rows.map((row: { student: { id: string }; status: string }) => [
        row.student.id,
        row.status,
      ]),
    );
    expect(byStudent.get(DEMO_IDS.students.alexey)).toBe('PRESENT');
    expect(byStudent.get(DEMO_IDS.students.dasha)).toBe('LATE');

    // Повторная отметка тем же телом не создаёт дублей и не меняет результат.
    const again = await http()
      .put(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(again.body.rows.length).toBe(marked.body.rows.length);

    // Статус можно переставить: лист перезаписывается целиком.
    const fixed = await http()
      .put(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ studentId: DEMO_IDS.students.dasha, status: 'ABSENT' }] })
      .expect(200);
    const dasha = fixed.body.rows.find(
      (row: { student: { id: string } }) => row.student.id === DEMO_IDS.students.dasha,
    );
    expect(dasha.status).toBe('ABSENT');
    expect(dasha.comment).toBeNull();
  });

  it('ученик не из группы → 422', async () => {
    const res = await http()
      .put(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ studentId: DEMO_IDS.students.alexey, status: 'PRESENT' }] })
      .expect(200);
    expect(res.body.rows.length).toBeGreaterThan(0);

    const foreign = await http()
      .put(`${base}/teacher/lessons/${DEMO_IDS.lessons.programmingTomorrow}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ studentId: DEMO_IDS.students.dasha, status: 'PRESENT' }] })
      .expect(422);
    expect(foreign.body.error.code).toBe('BUSINESS_RULE');
  });

  it('занятие другого преподавателя → 403, несуществующее → 404', async () => {
    const other = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId: `max-teacher-foreign-${Date.now()}`, roles: ['TEACHER'] })
      .expect(200);
    await http()
      .get(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${other.body.accessToken}`)
      .expect(403);

    await http()
      .get(`${base}/teacher/lessons/${DEMO_IDS.school}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('календарь преподавателя отдаёт занятия его групп', async () => {
    const res = await http()
      .get(`${base}/teacher/calendar`)
      .query({ from: '2020-01-01', to: '2999-01-01' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = res.body.lessons.map((lesson: { id: string }) => lesson.id);
    expect(ids).toContain(lessonId);
  });
});
