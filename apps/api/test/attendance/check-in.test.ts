/**
 * Отметка посещаемости по QR-коду (docs/07 F6a): преподаватель берёт код занятия, ученик
 * отмечается им, сервер проверяет подпись, срок, занятие и состав группы.
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { parseAttendanceQrValue } from '@edu/contracts';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../../src/common/auth/auth-user';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  deriveCheckInKey,
  signCheckInCode,
  verifyCheckInCode,
} from '../../src/modules/attendance/check-in-code';
import { CheckInService } from '../../src/modules/attendance/check-in.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe('код занятия (подпись)', () => {
  const key = deriveCheckInKey('test-secret-test-secret-test-secret-32');
  const lessonId = '0190a000-0000-7000-8000-000000000070';
  const now = new Date('2026-09-30T10:00:00Z');
  const expiresAt = new Date('2026-09-30T10:01:30Z');

  it('подлинный код отдаёт занятие и срок; 50 символов base64url', () => {
    const code = signCheckInCode(key, lessonId, expiresAt);
    expect(code).toMatch(/^[A-Za-z0-9_-]{50}$/);
    expect(verifyCheckInCode(key, code, now)).toEqual({ ok: true, lessonId, expiresAt });
  });

  it('протухший код → CODE_EXPIRED', () => {
    const code = signCheckInCode(key, lessonId, expiresAt);
    expect(verifyCheckInCode(key, code, expiresAt)).toEqual({ ok: false, reason: 'CODE_EXPIRED' });
  });

  it('подделка, чужой ключ и мусор → CODE_INVALID', () => {
    const code = signCheckInCode(key, lessonId, expiresAt);
    const tampered = `${code.slice(0, 10)}${code[10] === 'A' ? 'B' : 'A'}${code.slice(11)}`;
    const invalid = { ok: false, reason: 'CODE_INVALID' };
    expect(verifyCheckInCode(key, tampered, now)).toEqual(invalid);
    expect(
      verifyCheckInCode(deriveCheckInKey('other-secret-other-secret-other-32'), code, now),
    ).toEqual(invalid);
    expect(verifyCheckInCode(key, `${code}AA`, now)).toEqual(invalid);
    expect(verifyCheckInCode(key, 'не код', now)).toEqual(invalid);
  });
});

describe.skipIf(!hasTestDatabase)('отметка по QR (integration)', () => {
  let app: INestApplication;
  let teacher = '';
  let student = '';
  /** Мария из демо-мира — как её видит сервис (для кода «из прошлого»). */
  const teacherUser: AuthUser = {
    userId: DEMO_IDS.users.teacher,
    maxUserId: 'max-teacher-1',
    roles: ['TEACHER'],
    activeRole: 'TEACHER',
    profileId: DEMO_IDS.teachers.maria,
  };
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());
  const run = Date.now();
  const createdLessons: string[] = [];

  const login = async (maxUserId: string, role: 'TEACHER' | 'STUDENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body.accessToken as string;
  };

  /** Разовое занятие группы робототехники со смещением начала от «сейчас» (минуты). */
  const createLesson = async (startInMinutes: number) => {
    const startsAt = new Date(Date.now() + startInMinutes * 60_000);
    const res = await http()
      .post(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/lessons`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        topic: `QR-отметка ${run}`,
      })
      .expect(200);
    createdLessons.push(res.body.id);
    return res.body.id as string;
  };

  const getQr = (lessonId: string, token = teacher) =>
    http()
      .get(`${base}/teacher/lessons/${lessonId}/attendance/qr`)
      .set('Authorization', `Bearer ${token}`);

  const checkIn = (code: string, token = student) =>
    http()
      .post(`${base}/student/attendance/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code });

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await login('max-teacher-1', 'TEACHER');
    student = await login('max-student-1', 'STUDENT');
  });

  afterAll(async () => {
    // Отметки удаляются каскадом вместе с занятием.
    await app.get(PrismaService).lesson.deleteMany({ where: { id: { in: createdLessons } } });
    await app.close();
  });

  it('преподаватель берёт код, ученик отмечается: PRESENT, занятие → DONE, повтор идемпотентен', async () => {
    const lessonId = await createLesson(-10);
    const qr = await getQr(lessonId).expect(200);
    expect(qr.body.lessonId).toBe(lessonId);
    // В QR — ссылка, из которой сканер достанет тот же код.
    expect(parseAttendanceQrValue(qr.body.url)).toBe(qr.body.code);
    const ttl = new Date(qr.body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(60_000);
    expect(ttl).toBeLessThanOrEqual(90_000);

    const first = await checkIn(qr.body.code).expect(200);
    expect(first.body).toMatchObject({ status: 'PRESENT', alreadyMarked: false });
    expect(first.body.lesson).toMatchObject({
      id: lessonId,
      status: 'DONE',
      attendance: 'PRESENT',
    });

    const again = await checkIn(qr.body.code).expect(200);
    expect(again.body).toMatchObject({ status: 'PRESENT', alreadyMarked: true });

    const sheet = await http()
      .get(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(sheet.body.lesson.status).toBe('DONE');
    const alexey = sheet.body.rows.find(
      (row: { student: { id: string } }) => row.student.id === DEMO_IDS.students.alexey,
    );
    const dasha = sheet.body.rows.find(
      (row: { student: { id: string } }) => row.student.id === DEMO_IDS.students.dasha,
    );
    expect(alexey.status).toBe('PRESENT');
    // Не сканировавший остаётся неотмеченным — его решает преподаватель листом.
    expect(dasha.status).toBeNull();
  });

  it('«не был» от преподавателя перезаписывается сканом, «опоздал» — нет', async () => {
    const lessonId = await createLesson(-5);
    await http()
      .put(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({
        rows: [
          { studentId: DEMO_IDS.students.alexey, status: 'ABSENT', comment: 'Не пришёл к началу' },
        ],
      })
      .expect(200);
    const { body: qr } = await getQr(lessonId).expect(200);
    const res = await checkIn(qr.code).expect(200);
    expect(res.body).toMatchObject({ status: 'PRESENT', alreadyMarked: false });

    await http()
      .put(`${base}/teacher/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({ rows: [{ studentId: DEMO_IDS.students.alexey, status: 'LATE' }] })
      .expect(200);
    const late = await checkIn(qr.code).expect(200);
    expect(late.body).toMatchObject({ status: 'LATE', alreadyMarked: true });
  });

  it('протухший и поддельный код → 422 с причиной', async () => {
    const lessonId = await createLesson(-15);
    const stale = await app
      .get(CheckInService)
      .issueQr(teacherUser, lessonId, new Date(Date.now() - 120_000));
    const expired = await checkIn(stale.code).expect(422);
    expect(expired.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      details: { reason: 'CODE_EXPIRED' },
    });

    const { body: qr } = await getQr(lessonId).expect(200);
    const forged = `${qr.code.slice(0, -4)}${qr.code.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
    const invalid = await checkIn(forged).expect(422);
    expect(invalid.body.error.details).toEqual({ reason: 'CODE_INVALID' });
  });

  it('ученик не из группы → NOT_ENROLLED; отменённое занятие → LESSON_CANCELLED', async () => {
    const lessonId = await createLesson(0);
    const { body: qr } = await getQr(lessonId).expect(200);

    const stranger = await login(`max-student-qr-${run}`, 'STUDENT');
    const foreign = await checkIn(qr.code, stranger).expect(422);
    expect(foreign.body.error.details).toEqual({ reason: 'NOT_ENROLLED' });

    await http()
      .patch(`${base}/teacher/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${teacher}`)
      .send({ status: 'CANCELLED', cancelReason: 'Болезнь преподавателя' })
      .expect(200);
    const cancelled = await checkIn(qr.code).expect(422);
    expect(cancelled.body.error.details).toEqual({ reason: 'LESSON_CANCELLED' });
    // И нового кода на отменённое занятие нет.
    await getQr(lessonId).expect(422);
  });

  it('код выдаётся только в день занятия и только своему преподавателю', async () => {
    const future = await createLesson(3 * 24 * 60);
    const notToday = await getQr(future).expect(422);
    expect(notToday.body.error.code).toBe('BUSINESS_RULE');

    const today = await createLesson(30);
    const other = await login(`max-teacher-qr-${run}`, 'TEACHER');
    await getQr(today, other).expect(403);
    // Ученик код не берёт, преподаватель не отмечается сам.
    await getQr(today, student).expect(403);
    const { body: qr } = await getQr(today).expect(200);
    await checkIn(qr.code, teacher).expect(403);
  });
});
