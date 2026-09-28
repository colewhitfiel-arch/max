/**
 * Интеграция: демо-мир после seed не пустой ни у одной роли (стенд показывают жюри в день деплоя).
 * Кошелёк преподавателя видит поступление от демо-оплаты, «Спрос на кружки» — выбор Алексея,
 * у Python есть прошедшее занятие и выполненное задание, серия ученика живая, у родителя и
 * преподавателя есть уведомления. Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('демо-мир после seed (integration)', () => {
  let app: INestApplication;
  const tokens: Record<'teacher' | 'student' | 'parent', string> = {
    teacher: '',
    student: '',
    parent: '',
  };
  const base = '/api/v1';
  const get = (path: string, who: keyof typeof tokens) =>
    request(app.getHttpServer())
      .get(`${base}${path}`)
      .set('Authorization', `Bearer ${tokens[who]}`)
      .expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    const login = async (maxUserId: string, role: 'TEACHER' | 'STUDENT' | 'PARENT') => {
      const res = await request(app.getHttpServer())
        .post(`${base}/auth/dev`)
        .send({ maxUserId, roles: [role] })
        .expect(200);
      return (res.body as { accessToken: string }).accessToken;
    };
    tokens.teacher = await login('max-teacher-1', 'TEACHER');
    tokens.student = await login('max-student-1', 'STUDENT');
    tokens.parent = await login('max-parent-1', 'PARENT');
  });

  afterAll(async () => {
    await app.close();
  });

  it('кошелёк преподавателя: демо-оплата пришла поступлением', async () => {
    const res = await get('/teacher/wallet?period=month', 'teacher');
    const body = res.body as {
      balance: { amountKopecks: number };
      transactions: Array<{
        kind: string;
        amount: { amountKopecks: number };
        group: { id: string } | null;
        student: { id: string } | null;
      }>;
    };
    expect(body.balance.amountKopecks).toBeGreaterThanOrEqual(350_000);
    expect(body.transactions).toContainEqual(
      expect.objectContaining({
        kind: 'INCOME',
        amount: expect.objectContaining({ amountKopecks: 350_000 }),
        group: expect.objectContaining({ id: DEMO_IDS.groups.roboticsA }),
        student: expect.objectContaining({ id: DEMO_IDS.students.alexey }),
      }),
    );
  });

  it('спрос на кружки: онбординг Алексея записан', async () => {
    const res = await get('/teacher/clubs/demand', 'teacher');
    const body = res.body as {
      students: number;
      items: Array<{ club: { id: string }; chosen: number }>;
    };
    expect(body.students).toBeGreaterThanOrEqual(1);
    const chosen = new Map(body.items.map((item) => [item.club.id, item.chosen]));
    expect(chosen.get(DEMO_IDS.clubs.robotics)).toBeGreaterThanOrEqual(1);
    expect(chosen.get(DEMO_IDS.clubs.programming)).toBeGreaterThanOrEqual(1);
  });

  it('успеваемость за неделю: у Python есть посещение и выполненное задание', async () => {
    const res = await get('/teacher/performance?period=week', 'teacher');
    const python = (
      res.body as {
        groups: Array<{ group: { id: string }; attended: number; homeworkDone: number }>;
      }
    ).groups.find((row) => row.group.id === DEMO_IDS.groups.programmingA);
    expect(python?.attended).toBeGreaterThanOrEqual(1);
    expect(python?.homeworkDone).toBeGreaterThanOrEqual(1);
  });

  it('главная ученика: серия живая, у Python есть посещаемость', async () => {
    const res = await get('/student/home', 'student');
    const body = res.body as {
      streakDays?: number;
      clubs: Array<{ group: { id: string }; attendanceRate: number | null }>;
    };
    expect(body.streakDays).toBeGreaterThan(0);
    const python = body.clubs.find((club) => club.group.id === DEMO_IDS.groups.programmingA);
    expect(python?.attendanceRate).not.toBeNull();
  });

  it('уведомления есть у родителя и у преподавателя', async () => {
    // Листаем ленту до конца: демо-уведомления старые (дни назад), а каждый прогон тестов
    // добавляет демо-пользователям новых — на первой странице их может уже не быть.
    const allNotificationIds = async (who: keyof typeof tokens) => {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const page = (await get(`/notifications${query}`, who)).body as {
          items: Array<{ id: string }>;
          nextCursor?: string;
        };
        ids.push(...page.items.map((n) => n.id));
        cursor = page.nextCursor;
      } while (cursor);
      return ids;
    };
    expect(await allNotificationIds('parent')).toContain(DEMO_IDS.parentNotification);
    expect(await allNotificationIds('teacher')).toContain(DEMO_IDS.teacherNotification);
  });
});
