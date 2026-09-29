/**
 * Интеграция: группы преподавателя (docs/07 F19) — создание, название, состав и назначение ДЗ
 * новой группе. Отдельный преподаватель теста, после — его группы и всё созданное удаляются,
 * чтобы не менять демо-мир для других тестов. Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { JOB_QUEUE } from '../../src/common/queue/job-queue';
import { GroupsService } from '../../src/modules/groups/groups.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

const DAY_MS = 86_400_000;

describe.skipIf(!hasTestDatabase)('группы преподавателя (integration)', () => {
  let app: INestApplication;
  let teacher = '';
  let teacherId = '';
  let groupId = '';
  const base = '/api/v1';
  const run = Date.now();
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const loginAs = async (maxUserId: string, role: 'TEACHER' | 'STUDENT' | 'PARENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body as { accessToken: string; me: { teacher: { id: string } | null } };
  };

  const ids = (students: Array<{ id: string }>) => students.map((student) => student.id);
  /** Тело `POST /teacher/groups`: бесплатная группа без расписания. */
  const newGroup = (title: string, category = 'PROGRAMMING') => ({
    category,
    title,
    price: { amountKopecks: 0, currency: 'RUB' },
  });

  beforeAll(async () => {
    app = await createTestApp();
    const login = await loginAs(`max-teacher-groups-${run}`, 'TEACHER');
    teacher = login.accessToken;
    teacherId = login.me.teacher!.id;
  });

  afterAll(async () => {
    // Задача генерации из последнего теста дорабатывает в фоне — дожидаемся, потом чистим.
    await (app.get(JOB_QUEUE) as InlineJobQueue).drain();
    const prisma = app.get(PrismaService);
    const groups = await prisma.group.findMany({ where: { teacherId }, select: { id: true } });
    const groupIds = groups.map((group) => group.id);
    // Кружки групп теста создал сам POST /teacher/groups — их тоже убираем.
    const clubIds = (
      await prisma.group.findMany({ where: { teacherId }, select: { clubId: true } })
    ).map((group) => group.clubId);
    const enrollments = await prisma.enrollment.findMany({
      where: { groupId: { in: groupIds } },
      select: { id: true },
    });
    const enrollmentIds = enrollments.map((row) => row.id);
    await prisma.paidPeriod.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.payment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.teacherWalletTransaction.deleteMany({ where: { teacherId } });
    await prisma.submission.deleteMany({ where: { assignment: { groupId: { in: groupIds } } } });
    await prisma.assignment.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.courseGenerationJob.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.enrollment.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } });
    await app.close();
  });

  it('создание: группа появляется в списке и доступна как карточка', async () => {
    const created = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send(newGroup(`  Олимпиадная ${run}  `))
      .expect(200);
    groupId = created.body.group.id;
    expect(created.body.invite.url).toContain(created.body.invite.token);
    expect(created.body.group).toMatchObject({
      title: `Олимпиадная ${run}`,
      club: { category: 'PROGRAMMING', title: `Олимпиадная ${run}` },
      teacher: { id: teacherId },
    });

    const list = await http().get(`${base}/teacher/groups`).set(auth(teacher)).expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ id: groupId, studentsCount: 0, nextLesson: null }),
    ]);
    const detail = await http()
      .get(`${base}/teacher/groups/${groupId}`)
      .set(auth(teacher))
      .expect(200);
    expect(detail.body.students).toEqual([]);
  });

  it('создание: пустое название — 400, кружок не из восьми — 400, повтор названия — 409', async () => {
    await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send(newGroup('   '))
      .expect(400);
    const unknownClub = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send(newGroup(`Другая ${run}`, 'MATH'))
      .expect(400);
    expect(unknownClub.body.error.code).toBe('VALIDATION');
    const duplicate = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send(newGroup(`олимпиадная ${run}`, 'ROBOTICS'))
      .expect(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('название: `_` и `%` — обычные символы, а не шаблоны; дубль при переименовании — 409', async () => {
    // Уже есть «Олимпиадная <run>»: как шаблон ILIKE оба названия ниже с ним совпали бы.
    const underscore = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send(newGroup(`Олимпиадная_${run}`))
      .expect(200);
    await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send(newGroup(`%${run}`))
      .expect(200);
    const duplicate = await http()
      .patch(`${base}/teacher/groups/${underscore.body.group.id}`)
      .set(auth(teacher))
      .send({ title: `ОЛИМПИАДНАЯ ${run}` })
      .expect(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('переименование', async () => {
    const renamed = await http()
      .patch(`${base}/teacher/groups/${groupId}`)
      .set(auth(teacher))
      .send({ title: `Олимпиадная, 7 класс ${run}` })
      .expect(200);
    expect(renamed.body.title).toBe(`Олимпиадная, 7 класс ${run}`);
  });

  it('кандидаты — ученики школы; поиск по имени', async () => {
    const all = await http()
      .get(`${base}/teacher/groups/${groupId}/candidates`)
      .set(auth(teacher))
      .expect(200);
    expect(ids(all.body.items)).toEqual(
      expect.arrayContaining([DEMO_IDS.students.alexey, DEMO_IDS.students.dasha]),
    );
    const found = await http()
      .get(`${base}/teacher/groups/${groupId}/candidates`)
      .query({ q: 'даш' })
      .set(auth(teacher))
      .expect(200);
    expect(ids(found.body.items)).toEqual([DEMO_IDS.students.dasha]);

    // Цифры в строке поиска — строка, а не число (query не разбирается как JSON).
    await http()
      .get(`${base}/teacher/groups/${groupId}/candidates`)
      .query({ q: '7' })
      .set(auth(teacher))
      .expect(200);
  });

  it('кандидаты — и ученик без школы в профиле, зачисленный в группу кружка школы', async () => {
    // Так приходят настоящие ученики: онбординг зачисляет в первую группу кружка (здесь —
    // группу другого преподавателя школы), а школу в профиль ученика не записывает.
    const newcomer = await loginAs(`max-student-onboarded-${run}`, 'STUDENT');
    const me = await http().get(`${base}/me`).set(auth(newcomer.accessToken)).expect(200);
    const studentId = me.body.student.id as string;
    await app.get(GroupsService).enroll(studentId, DEMO_IDS.groups.roboticsA);
    try {
      const res = await http()
        .get(`${base}/teacher/groups/${groupId}/candidates`)
        .set(auth(teacher))
        .expect(200);
      expect(ids(res.body.items)).toContain(studentId);
    } finally {
      await app.get(PrismaService).enrollment.deleteMany({ where: { studentId } });
    }
  });

  it('состав: добавить, повторно добавить (идемпотентно), убрать и вернуть', async () => {
    const added = await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.alexey })
      .expect(200);
    expect(ids(added.body.students)).toEqual([DEMO_IDS.students.alexey]);

    await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.dasha })
      .expect(200);
    const again = await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.dasha })
      .expect(200);
    expect(ids(again.body.students).sort()).toEqual(
      [DEMO_IDS.students.alexey, DEMO_IDS.students.dasha].sort(),
    );

    const candidates = await http()
      .get(`${base}/teacher/groups/${groupId}/candidates`)
      .set(auth(teacher))
      .expect(200);
    expect(ids(candidates.body.items)).not.toContain(DEMO_IDS.students.alexey);

    const removed = await http()
      .delete(`${base}/teacher/groups/${groupId}/students/${DEMO_IDS.students.dasha}`)
      .set(auth(teacher))
      .expect(200);
    expect(ids(removed.body.students)).toEqual([DEMO_IDS.students.alexey]);
    const detail = await http()
      .get(`${base}/teacher/groups/${groupId}`)
      .set(auth(teacher))
      .expect(200);
    expect(detail.body.studentsCount).toBe(1);

    const back = await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.dasha })
      .expect(200);
    expect(back.body.students).toHaveLength(2);
    await http()
      .delete(`${base}/teacher/groups/${groupId}/students/${DEMO_IDS.students.dasha}`)
      .set(auth(teacher))
      .expect(200);
  });

  it('счётчики задания — по текущему составу: сдачи убранного ученика не считаются', async () => {
    await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.dasha })
      .expect(200);
    const create = (studentIds?: string[]) =>
      http()
        .post(`${base}/teacher/assignments`)
        .set(auth(teacher))
        .send({ groupId, title: `Сдают все ${run}`, publish: true, studentIds })
        .expect(200);
    const assignments = [
      (await create()).body.id as string,
      (await create([DEMO_IDS.students.alexey, DEMO_IDS.students.dasha])).body.id as string,
    ];
    const students = [
      await loginAs('max-student-1', 'STUDENT'),
      await loginAs('max-student-2', 'STUDENT'),
    ];
    for (const assignmentId of assignments) {
      for (const [index, student] of students.entries()) {
        await http()
          .post(`${base}/student/assignments/${assignmentId}/submit`)
          .set(auth(student.accessToken))
          .set('Idempotency-Key', `groups-${run}-${assignmentId}-${index}`)
          .send({ text: 'Готово' })
          .expect(200);
      }
    }
    await http()
      .delete(`${base}/teacher/groups/${groupId}/students/${DEMO_IDS.students.dasha}`)
      .set(auth(teacher))
      .expect(200);

    const list = await http()
      .get(`${base}/teacher/assignments`)
      .query({ groupId })
      .set(auth(teacher))
      .expect(200);
    for (const assignmentId of assignments) {
      const card = list.body.items.find((item: { id: string }) => item.id === assignmentId);
      expect(card).toMatchObject({ studentsCount: 1, submittedCount: 1 });
      const submissions = await http()
        .get(`${base}/teacher/assignments/${assignmentId}/submissions`)
        .set(auth(teacher))
        .expect(200);
      expect(submissions.body.rows).toHaveLength(card.studentsCount);
      expect(submissions.body.assignment).toMatchObject({ studentsCount: 1, submittedCount: 1 });
    }
  });

  it('оплата: по зачислению ушедшего из группы (LEFT) платёж не создаётся — 404', async () => {
    const enrollment = await app.get(PrismaService).enrollment.findUniqueOrThrow({
      where: { studentId_groupId: { studentId: DEMO_IDS.students.alexey, groupId } },
      select: { id: true },
    });
    await http()
      .delete(`${base}/teacher/groups/${groupId}/students/${DEMO_IDS.students.alexey}`)
      .set(auth(teacher))
      .expect(200);
    const parent = await loginAs('max-parent-1', 'PARENT');
    const res = await http()
      .post(`${base}/parent/children/${DEMO_IDS.students.alexey}/payments`)
      .set(auth(parent.accessToken))
      .set('Idempotency-Key', `groups-left-${run}`)
      .send({ enrollmentId: enrollment.id, periodsCount: 1 })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.alexey })
      .expect(200);
  });

  it('оплата: вернувшемуся в группу следующий платёж — не раньше нового зачисления', async () => {
    const prisma = app.get(PrismaService);
    const where = { studentId_groupId: { studentId: DEMO_IDS.students.alexey, groupId } };
    const { id: enrollmentId } = await prisma.enrollment.findUniqueOrThrow({
      where,
      select: { id: true },
    });
    // Прошлое пребывание в группе было оплачено; период закончился два месяца назад.
    const payment = await prisma.payment.create({
      data: {
        parentId: DEMO_IDS.parents.olga,
        studentId: DEMO_IDS.students.alexey,
        enrollmentId,
        amountKopecks: 100_00,
        provider: 'fake',
        idempotencyKey: `groups-old-${run}`,
        status: 'SUCCEEDED',
        paidAt: new Date(Date.now() - 90 * DAY_MS),
      },
    });
    await prisma.paidPeriod.create({
      data: {
        enrollmentId,
        paymentId: payment.id,
        periodStart: new Date(Date.now() - 90 * DAY_MS),
        periodEnd: new Date(Date.now() - 60 * DAY_MS),
      },
    });
    await http()
      .delete(`${base}/teacher/groups/${groupId}/students/${DEMO_IDS.students.alexey}`)
      .set(auth(teacher))
      .expect(200);
    await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: DEMO_IDS.students.alexey })
      .expect(200);
    const { enrolledAt } = await prisma.enrollment.findUniqueOrThrow({
      where,
      select: { enrolledAt: true },
    });

    const parent = await loginAs('max-parent-1', 'PARENT');
    const res = await http()
      .get(`${base}/parent/children/${DEMO_IDS.students.alexey}/payments`)
      .set(auth(parent.accessToken))
      .expect(200);
    const period = res.body.periods.find(
      (item: { enrollmentId: string }) => item.enrollmentId === enrollmentId,
    );
    expect(period.nextPaymentAt).toBe(enrolledAt.toISOString().slice(0, 10));
  });

  it('ученика не из школы и не из своих групп добавить нельзя — 404', async () => {
    const stranger = await loginAs(`max-student-stranger-${run}`, 'STUDENT');
    const me = await http().get(`${base}/me`).set(auth(stranger.accessToken)).expect(200);
    const res = await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(teacher))
      .send({ studentId: me.body.student.id })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('чужая группа — 403; ученику ручки недоступны — 403', async () => {
    const maria = await loginAs('max-teacher-1', 'TEACHER');
    await http()
      .post(`${base}/teacher/groups/${groupId}/students`)
      .set(auth(maria.accessToken))
      .send({ studentId: DEMO_IDS.students.dasha })
      .expect(403);
    await http()
      .patch(`${base}/teacher/groups/${groupId}`)
      .set(auth(maria.accessToken))
      .send({ title: 'Чужая' })
      .expect(403);
    const student = await loginAs('max-student-1', 'STUDENT');
    await http()
      .post(`${base}/teacher/groups`)
      .set(auth(student.accessToken))
      .send(newGroup('Моя группа'))
      .expect(403);
  });

  it('ДЗ новой группе: ученик группы видит задание, мастер «Задать ДЗ» принимает группу', async () => {
    const assignment = await http()
      .post(`${base}/teacher/assignments`)
      .set(auth(teacher))
      .send({ groupId, title: `Задачи для новой группы ${run}`, publish: true })
      .expect(200);

    const alexey = await loginAs('max-student-1', 'STUDENT');
    const list = await http()
      .get(`${base}/student/assignments`)
      .set(auth(alexey.accessToken))
      .expect(200);
    expect(ids(list.body.items)).toContain(assignment.body.id);

    // Ученика, которого убрали из группы, адресатом выбрать нельзя; участника — можно.
    await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set(auth(teacher))
      .send({
        groupId,
        target: 'HOMEWORK',
        studentIds: [DEMO_IDS.students.dasha],
        topic: 'Циклы в Python: практика на списках для 7 класса',
      })
      .expect(422);
    const job = await http()
      .post(`${base}/teacher/course-builder/jobs`)
      .set(auth(teacher))
      .send({
        groupId,
        target: 'HOMEWORK',
        studentIds: [DEMO_IDS.students.alexey],
        topic: 'Циклы в Python: практика на списках для 7 класса',
      })
      .expect(200);
    expect(job.body).toMatchObject({ groupId, target: 'HOMEWORK' });
  });
});
