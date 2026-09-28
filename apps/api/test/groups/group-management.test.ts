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
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('группы преподавателя (integration)', () => {
  let app: INestApplication;
  let teacher = '';
  let teacherId = '';
  let groupId = '';
  const base = '/api/v1';
  const run = Date.now();
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const loginAs = async (maxUserId: string, role: 'TEACHER' | 'STUDENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body as { accessToken: string; me: { teacher: { id: string } | null } };
  };

  const ids = (students: Array<{ id: string }>) => students.map((student) => student.id);

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
    await prisma.submission.deleteMany({ where: { assignment: { groupId: { in: groupIds } } } });
    await prisma.assignment.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.courseGenerationJob.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.enrollment.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    await app.close();
  });

  it('создание: группа появляется в списке и доступна как карточка', async () => {
    const created = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send({ title: `  Олимпиадная ${run}  `, clubId: DEMO_IDS.clubs.programming })
      .expect(200);
    groupId = created.body.id;
    expect(created.body).toMatchObject({
      title: `Олимпиадная ${run}`,
      club: { id: DEMO_IDS.clubs.programming },
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

  it('создание: пустое название — 400, чужой кружок — 400, повтор названия — 409', async () => {
    await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send({ title: '   ', clubId: DEMO_IDS.clubs.programming })
      .expect(400);
    const foreignClub = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send({ title: `Другая ${run}`, clubId: DEMO_IDS.groups.roboticsA })
      .expect(400);
    expect(foreignClub.body.error.code).toBe('VALIDATION');
    const duplicate = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send({ title: `олимпиадная ${run}`, clubId: DEMO_IDS.clubs.robotics })
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
      .send({ title: 'Моя группа', clubId: DEMO_IDS.clubs.programming })
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
