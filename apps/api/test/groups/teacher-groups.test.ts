/**
 * Интеграция: преподаватель выбирает, какие кружки ведёт, заводит свою группу и зовёт учеников
 * по ссылке; ученик вступает в один тап (docs/07 F19). Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { CLUB_CATEGORIES } from '@edu/contracts';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('группы преподавателя и ссылки (integration)', () => {
  let app: INestApplication;
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const loginAs = async (maxUserId: string, role: 'TEACHER' | 'STUDENT' | 'PARENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('каталог — все 8 кружков', async () => {
    const student = await loginAs('max-student-1', 'STUDENT');
    const res = await http().get(`${base}/catalog/clubs?limit=50`).set(auth(student)).expect(200);
    const categories = new Set(res.body.items.map((club: { category: string }) => club.category));
    for (const category of CLUB_CATEGORIES) expect(categories.has(category), category).toBe(true);
  });

  it('новый преподаватель выбирает кружки: без повторов, в порядке списка', async () => {
    // Тестовая БД живёт между прогонами — каждый раз новый преподаватель.
    const teacher = await loginAs(`max-teacher-subjects-${Date.now()}`, 'TEACHER');
    const before = await http().get(`${base}/me`).set(auth(teacher)).expect(200);
    expect(before.body.teacher.subjects).toEqual([]);

    const res = await http()
      .patch(`${base}/me/teacher`)
      .set(auth(teacher))
      .send({
        subjects: ['CHESS', 'ROBOTICS', 'CHINESE', 'CHESS', 'ART'],
        qualification: '  Мастер ФИДЕ  ',
      })
      .expect(200);
    expect(res.body.teacher.subjects).toEqual(['ROBOTICS', 'CHINESE', 'ART', 'CHESS']);
    expect(res.body.teacher.qualification).toBe('Мастер ФИДЕ');

    await http().patch(`${base}/me/teacher`).set(auth(teacher)).send({ subjects: [] }).expect(400);
    await http()
      .patch(`${base}/me/teacher`)
      .set(auth(teacher))
      .send({ subjects: ['MATH'] })
      .expect(400);
  });

  it('ученику менять кружки преподавателя нельзя', async () => {
    const student = await loginAs('max-student-1', 'STUDENT');
    await http()
      .patch(`${base}/me/teacher`)
      .set(auth(student))
      .send({ subjects: ['ART'] })
      .expect(403);
  });

  it('группа со ссылкой: ученик видит её, вступает, повтор ничего не меняет', async () => {
    const teacher = await loginAs('max-teacher-groups', 'TEACHER');
    const created = await http()
      .post(`${base}/teacher/groups`)
      .set(auth(teacher))
      .send({
        category: 'CHINESE',
        title: 'Китайский, 5 класс',
        description: 'Иероглифы с нуля',
        price: { amountKopecks: 150_000, currency: 'RUB' },
        schedule: [{ weekday: 2, startTime: '17:00', endTime: '18:00', room: 'Каб. 9' }],
      })
      .expect(200);
    const { group, invite } = created.body;
    expect(group.club.category).toBe('CHINESE');
    expect(group.title).toBe('Китайский, 5 класс');
    expect(invite.url).toMatch(new RegExp(`/join/${invite.token}$`));

    // Группа сразу в списке преподавателя, с занятиями по расписанию.
    const list = await http().get(`${base}/teacher/groups`).set(auth(teacher)).expect(200);
    expect(list.body.items.map((g: { id: string }) => g.id)).toContain(group.id);
    const lessons = await http()
      .get(`${base}/teacher/groups/${group.id}/lessons`)
      .query({ from: new Date().toISOString().slice(0, 10) })
      .set(auth(teacher))
      .expect(200);
    expect(lessons.body.lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons.body.lessons) {
      // Вторник 17:00 по Москве = 14:00 UTC.
      expect(new Date(lesson.startsAt).getUTCDay()).toBe(2);
      expect(lesson.startsAt).toMatch(/T14:00:00/);
    }

    // Ссылка стабильна, пока её не сбросят.
    const again = await http()
      .get(`${base}/teacher/groups/${group.id}/invite`)
      .set(auth(teacher))
      .expect(200);
    expect(again.body.token).toBe(invite.token);

    const student = await loginAs(`max-student-join-${Date.now()}`, 'STUDENT');
    const preview = await http()
      .get(`${base}/student/group-invites/${invite.token}`)
      .set(auth(student))
      .expect(200);
    expect(preview.body).toMatchObject({
      joined: false,
      studentsCount: 0,
      description: 'Иероглифы с нуля',
      price: { amountKopecks: 150_000, currency: 'RUB' },
    });
    expect(preview.body.schedule).toHaveLength(1);

    const joined = await http()
      .post(`${base}/student/group-invites/${invite.token}/join`)
      .set(auth(student))
      .send()
      .expect(200);
    expect(joined.body.alreadyJoined).toBe(false);
    const repeat = await http()
      .post(`${base}/student/group-invites/${invite.token}/join`)
      .set(auth(student))
      .send()
      .expect(200);
    expect(repeat.body).toMatchObject({
      alreadyJoined: true,
      enrollmentId: joined.body.enrollmentId,
    });

    const detail = await http()
      .get(`${base}/teacher/groups/${group.id}`)
      .set(auth(teacher))
      .expect(200);
    expect(detail.body.students).toHaveLength(1);
    const after = await http()
      .get(`${base}/student/group-invites/${invite.token}`)
      .set(auth(student))
      .expect(200);
    expect(after.body).toMatchObject({ joined: true, studentsCount: 1 });
  });

  it('сброс ссылки: старая — 404, новая работает', async () => {
    const teacher = await loginAs('max-teacher-1', 'TEACHER');
    const old = await http()
      .get(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/invite`)
      .set(auth(teacher))
      .expect(200);
    const fresh = await http()
      .post(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/invite/reset`)
      .set(auth(teacher))
      .send()
      .expect(200);
    expect(fresh.body.token).not.toBe(old.body.token);

    const student = await loginAs('max-student-2', 'STUDENT');
    await http()
      .get(`${base}/student/group-invites/${old.body.token}`)
      .set(auth(student))
      .expect(404);
    const preview = await http()
      .get(`${base}/student/group-invites/${fresh.body.token}`)
      .set(auth(student))
      .expect(200);
    // Даша уже в группе робототехники.
    expect(preview.body.joined).toBe(true);
  });

  it('чужая группа — 403, преподаватель по ссылке не вступает', async () => {
    const stranger = await loginAs('max-teacher-stranger', 'TEACHER');
    await http()
      .get(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/invite`)
      .set(auth(stranger))
      .expect(403);
    const owner = await loginAs('max-teacher-1', 'TEACHER');
    const invite = await http()
      .get(`${base}/teacher/groups/${DEMO_IDS.groups.roboticsA}/invite`)
      .set(auth(owner))
      .expect(200);
    await http()
      .post(`${base}/student/group-invites/${invite.body.token}/join`)
      .set(auth(owner))
      .send()
      .expect(403);
  });
});
