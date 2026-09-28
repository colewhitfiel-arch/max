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
  const assignmentIds: string[] = [];
  const newcomerIds: string[] = [];
  const run = Date.now();
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
    return res.body as {
      attendanceRate: number | null;
      completionRate: number | null;
      students: StudentRow[];
    };
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
    await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    await prisma.enrollment.deleteMany({
      where: { groupId: DEMO_IDS.groups.roboticsA, studentId: { in: newcomerIds } },
    });
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

  it('уважительный пропуск (EXCUSED) из знаменателя посещаемости исключается', async () => {
    // Вчерашнее проведённое занятие, на котором у Алексея уважительная причина.
    const startsAt = new Date(Date.now() - DAY_MS);
    const lesson = await http()
      .post(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/lessons`)
      .set(auth(teacher))
      .send({
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
        topic: 'Занятие с уважительным пропуском',
      })
      .expect(200);
    lessonIds.push(lesson.body.id);
    await http()
      .put(`${base}/teacher/lessons/${lesson.body.id}/attendance`)
      .set(auth(teacher))
      .send({ rows: [{ studentId: DEMO_IDS.students.alexey, status: 'EXCUSED' }] })
      .expect(200);

    const detail = await groupDetail();
    const row = rowOf(detail.students, DEMO_IDS.students.alexey);
    expect(row?.attendanceRate).toBe(1);
    expect(row?.needsAttention).not.toContain('Пропускает занятия');

    // Та же цифра, что у ученика на главной (StudentFactsService): формула одна.
    const home = await http().get(`${base}/student/home`).set(auth(alexey)).expect(200);
    expect(home.body.stats.attendanceRate).toBe(1);
  });

  it('новый ученик: занятия и сроки заданий до его зачисления ему не в счёт', async () => {
    // Срок задания всей группе прошёл вчера — до того, как в группу пришёл новый ученик.
    const assignment = await http()
      .post(`${base}/teacher/assignments`)
      .set(auth(teacher))
      .send({
        groupId: DEMO_IDS.groups.roboticsA,
        title: `Прошлое ДЗ ${run}`,
        dueAt: new Date(Date.now() - DAY_MS).toISOString(),
        publish: true,
      })
      .expect(200);
    assignmentIds.push(assignment.body.id);
    const before = await groupDetail();

    const newcomer = await login(`max-student-newcomer-${run}`, 'STUDENT');
    const me = await http().get(`${base}/me`).set(auth(newcomer)).expect(200);
    const newcomerId = me.body.student.id as string;
    newcomerIds.push(newcomerId);
    await app.get(PrismaService).enrollment.create({
      data: { studentId: newcomerId, groupId: DEMO_IDS.groups.roboticsA },
    });

    const after = await groupDetail();
    expect(rowOf(after.students, newcomerId)).toMatchObject({
      attendanceRate: null,
      completionRate: null,
      needsAttention: [],
    });
    // Показатели группы новичок не портит: его знаменатели пока пустые.
    expect(after.attendanceRate).toBe(before.attendanceRate);
    expect(after.completionRate).toBe(before.completionRate);

    const home = await http().get(`${base}/student/home`).set(auth(newcomer)).expect(200);
    expect(home.body.stats).toMatchObject({ attendanceRate: null, completionRate: null });
  });
});
