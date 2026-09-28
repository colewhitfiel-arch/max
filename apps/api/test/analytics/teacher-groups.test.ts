/**
 * Интеграция: показатели групп преподавателя и ученика по формулам docs/04 §4.6.
 * Созданное тестом (занятия) удаляется после, демо-мир для других тестов не меняется.
 * Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type StudentRow = {
  student: { id: string };
  attendanceRate: number | null;
  completionRate: number | null;
  needsAttention: string[];
};

describe.skipIf(!hasTestDatabase)('показатели групп (integration)', () => {
  let app: INestApplication;
  let teacher = '';
  let alexey = '';
  const lessonIds: string[] = [];
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (maxUserId: string, role: 'TEACHER' | 'STUDENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body.accessToken as string;
  };

  const groupDetail = async () => {
    const res = await http()
      .get(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}`)
      .set(auth(teacher))
      .expect(200);
    return res.body as { attendanceRate: number | null; students: StudentRow[] };
  };

  const rowOf = (rows: StudentRow[], studentId: string) =>
    rows.find((row) => row.student.id === studentId);

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await login('max-teacher-1', 'TEACHER');
    alexey = await login('max-student-1', 'STUDENT');
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    await app.close();
  });

  it('неотмеченное прошедшее занятие (PLANNED) не считается пропуском', async () => {
    // Алексей был на обоих проведённых занятиях; занятие два дня назад так и не отметили.
    const startsAt = new Date(Date.now() - 2 * DAY_MS);
    const lesson = await http()
      .post(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/lessons`)
      .set(auth(teacher))
      .send({
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
        topic: 'Неотмеченное занятие',
      })
      .expect(200);
    lessonIds.push(lesson.body.id);
    expect(lesson.body.status).toBe('PLANNED');

    const detail = await groupDetail();
    const row = rowOf(detail.students, DEMO_IDS.students.alexey);
    expect(row?.attendanceRate).toBe(1);
    expect(row?.needsAttention).not.toContain('Пропускает занятия');

    const home = await http().get(`${base}/student/home`).set(auth(alexey)).expect(200);
    expect(home.body.stats.attendanceRate).toBe(1);
  });
});
