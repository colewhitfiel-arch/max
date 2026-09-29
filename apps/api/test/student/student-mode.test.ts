/**
 * Интеграция: режим ученика на настоящем API — курсы и блоки, главная и профиль,
 * календарь, каталог, уведомления (docs/07 F1–F5, F13). Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('режим ученика (integration)', () => {
  let app: INestApplication;
  let alexey = '';
  let dasha = '';
  let teacher = '';
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());

  const loginAs = async (maxUserId: string, role: 'TEACHER' | 'STUDENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    alexey = await loginAs('max-student-1', 'STUDENT');
    dasha = await loginAs('max-student-2', 'STUDENT');
    teacher = await loginAs('max-teacher-1', 'TEACHER');
  });

  afterAll(async () => {
    await app.close();
  });

  it('список курсов отдаёт прогресс и следующий блок', async () => {
    const res = await http()
      .get(`${base}/student/courses`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    const course = res.body.items.find((item: { id: string }) => item.id === DEMO_IDS.course);
    expect(course).toBeDefined();
    expect(course.progress.totalBlocks).toBeGreaterThan(0);
    expect(course.progress.percent).toBeGreaterThanOrEqual(0);
    expect(course.nextBlock).not.toBeNull();
  });

  it('структура курса показывает прогресс по блокам', async () => {
    const res = await http()
      .get(`${base}/student/courses/${DEMO_IDS.course}`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    const blocks = res.body.modules.flatMap((m: { blocks: unknown[] }) => m.blocks);
    const intro = blocks.find((b: { id: string }) => b.id === DEMO_IDS.blocks.introText);
    expect(intro.progress).toBe('COMPLETED');
  });

  it('блок QUIZ приходит без правильных ответов и с заданием', async () => {
    const res = await http()
      .get(`${base}/student/blocks/${DEMO_IDS.blocks.sensorsQuiz}`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(res.body.type).toBe('QUIZ');
    for (const question of res.body.content.questions) {
      expect(question).not.toHaveProperty('correctOptionIds');
      expect(question).not.toHaveProperty('explanation');
    }
    expect(res.body.courseId).toBe(DEMO_IDS.course);
  });

  it('open помечает блок открытым, complete считает балл QUIZ и двигает прогресс курса', async () => {
    const blockId = DEMO_IDS.blocks.sensorsQuiz;
    const opened = await http()
      .post(`${base}/student/blocks/${blockId}/open`)
      .set('Authorization', `Bearer ${dasha}`)
      .send({})
      .expect(200);
    expect(['OPENED', 'COMPLETED']).toContain(opened.body.progress.status);

    // Ответы ученика берём из блока преподавателя — там видны правильные варианты.
    const teacherCourse = await http()
      .get(`${base}/teacher/courses/${DEMO_IDS.course}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    const quiz = teacherCourse.body.modules
      .flatMap((m: { blocks: Array<{ id: string; type: string; content: unknown }> }) => m.blocks)
      .find((b: { id: string }) => b.id === blockId);
    const answers = Object.fromEntries(
      (
        quiz.content as { questions: Array<{ id: string; correctOptionIds: string[] }> }
      ).questions.map((question) => [question.id, question.correctOptionIds]),
    );

    const completed = await http()
      .post(`${base}/student/blocks/${blockId}/complete`)
      .set('Authorization', `Bearer ${dasha}`)
      .send({ answers })
      .expect(200);
    expect(completed.body.score).toBe(100);
    expect(completed.body.progress.status).toBe('COMPLETED');
    expect(completed.body.courseProgress.completedBlocks).toBeGreaterThan(0);

    // Пустая попытка не засчитывается как верная.
    const empty = await http()
      .post(`${base}/student/blocks/${blockId}/complete`)
      .set('Authorization', `Bearer ${dasha}`)
      .send({ answers: {} })
      .expect(200);
    expect(empty.body.score).toBe(0);
  });

  it('чужой курс ученику не виден', async () => {
    const res = await http()
      .get(`${base}/student/courses/${DEMO_IDS.course}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('главная и профиль считают показатели, серию и кристаллы', async () => {
    const home = await http()
      .get(`${base}/student/home`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(home.body.week).toHaveLength(7);
    expect(home.body.points).toBeGreaterThanOrEqual(0);
    expect(home.body.stats.period.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const profile = await http()
      .get(`${base}/student/profile`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(profile.body.user.firstName).toBe('Алексей');
    expect(profile.body.clubHomework.length).toBe(profile.body.clubs.length);
    const totals = profile.body.clubHomework.reduce(
      (sum: number, item: { tasks: unknown[] }) => sum + item.tasks.length,
      0,
    );
    const counts = profile.body.homework;
    expect(counts.correct + counts.wrong + counts.upcoming).toBe(totals);
  });

  it('календарь отдаёт занятия с отметкой посещаемости', async () => {
    const res = await http()
      .get(`${base}/student/calendar`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(res.body.lessons.length).toBeGreaterThan(0);
    expect(res.body.lessons.some((lesson: { attendance: unknown }) => lesson.attendance)).toBe(
      true,
    );
  });

  it('каталог фильтрует по категории, карточка кружка содержит группы', async () => {
    const list = await http()
      .get(`${base}/catalog/clubs?category=ROBOTICS`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(
      list.body.items.every((club: { category: string }) => club.category === 'ROBOTICS'),
    ).toBe(true);

    const detail = await http()
      .get(`${base}/catalog/clubs/${DEMO_IDS.clubs.robotics}`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(detail.body.groups.length).toBeGreaterThan(0);
  });

  it('уведомления: лента, счётчик и отметка о прочтении', async () => {
    const list = await http()
      .get(`${base}/notifications`)
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(list.body.unreadCount).toBeGreaterThanOrEqual(0);

    // Фильтр «только непрочитанные» — строка 'true' в query, как её шлёт клиент.
    const unread = await http()
      .get(`${base}/notifications`)
      .query({ unreadOnly: 'true' })
      .set('Authorization', `Bearer ${alexey}`)
      .expect(200);
    expect(unread.body.items.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);

    const read = await http()
      .post(`${base}/notifications/read`)
      .set('Authorization', `Bearer ${alexey}`)
      .send({})
      .expect(200);
    expect(read.body.unreadCount).toBe(0);

    const settings = await http()
      .put(`${base}/me/notification-settings`)
      .set('Authorization', `Bearer ${alexey}`)
      .send({
        lessons: true,
        assignments: false,
        grades: true,
        attendance: true,
        insights: true,
        payments: true,
      })
      .expect(200);
    expect(settings.body.assignments).toBe(false);
  });
});
