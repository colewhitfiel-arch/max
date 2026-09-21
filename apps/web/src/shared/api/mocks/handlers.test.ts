// @vitest-environment node
/**
 * Сквозная проверка демо-мира: реальный ts-rest клиент + MSW в Node. Гарантирует, что в
 * `VITE_API_MODE=mock` все хуки страниц получают данные, прошедшие схемы контракта.
 */
import { STREAMING_ROUTES, type AiStreamEvent, type TokenPair } from '@edu/contracts';
import { DEMO_IDS, demoUsers } from '@edu/contracts/fixtures';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, call, setApiAuthAdapter } from '../client';
import { ApiClientError } from '../errors';
import { streamSse } from '../sse';
import { handlers } from './handlers';
import { resetMockDb } from './state';

const server = setupServer(...handlers);

function session(tokens: TokenPair | null) {
  setApiAuthAdapter(
    tokens
      ? {
          getAccessToken: () => tokens.accessToken,
          getRefreshToken: () => tokens.refreshToken,
          onTokensRefreshed: () => {},
          onUnauthorized: () => {},
        }
      : null,
  );
}

async function loginAs(key: keyof typeof demoUsers, role = demoUsers[key].roles[0]!) {
  const user = demoUsers[key];
  const result = await call(
    api.auth.loginDev({ body: { maxUserId: user.maxUserId, roles: [role] } }),
  );
  session(result);
  return result;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => resetMockDb());
afterEach(() => session(null));

describe('mock world (msw/node)', () => {
  it('health без авторизации', async () => {
    const health = await call(api.health.getHealth());
    expect(health.status).toBe('ok');
  });

  it('без токена — 401 UNAUTHORIZED; нереализованная ручка — 501', async () => {
    await expect(call(api.dashboards.getStudentHome())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await loginAs('teacher');
    await expect(
      call(api.courses.archiveCourse({ params: { courseId: DEMO_IDS.course } })),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('ученик: вход, главная, профиль, курсы, задания, тьютор, уведомления', async () => {
    const login = await loginAs('student1');
    expect(login.me.activeRole).toBe('STUDENT');
    expect(login.me.student?.onboardingCompleted).toBe(true);

    const me = await call(api.auth.getMe());
    expect(me.user.id).toBe(demoUsers.student1.id);

    const home = await call(api.dashboards.getStudentHome());
    expect(home.today.length + home.upcoming.length).toBeGreaterThan(0);
    expect(home.tasks.length).toBeGreaterThan(0);
    expect(home.clubs).toHaveLength(2);
    expect(home.aiComment).not.toBeNull();

    const profile = await call(api.dashboards.getStudentProfile());
    expect(profile.school?.name).toContain('Школа');

    const calendar = await call(
      api.groups.getStudentCalendar({ query: { from: '2020-01-01', to: '2099-01-01' } }),
    );
    expect(calendar.lessons).toHaveLength(5);
    expect(calendar.lessons.find((l) => l.id === DEMO_IDS.lessons.roboticsPast1)?.attendance).toBe(
      'PRESENT',
    );

    const courses = await call(api.courses.listStudentCourses());
    expect(courses.items[0]?.progress).toEqual({ percent: 25, completedBlocks: 1, totalBlocks: 4 });
    const course = await call(
      api.courses.getStudentCourse({ params: { courseId: DEMO_IDS.course } }),
    );
    expect(course.modules).toHaveLength(2);
    const quiz = await call(
      api.courses.getStudentBlock({ params: { blockId: DEMO_IDS.blocks.sensorsQuiz } }),
    );
    expect(quiz.type).toBe('QUIZ');
    if (quiz.type === 'QUIZ') expect('correctOptionIds' in quiz.content.questions[0]!).toBe(false);
    expect(quiz.assignment?.id).toBe(DEMO_IDS.assignments.quiz);
    await call(api.courses.openBlock({ params: { blockId: DEMO_IDS.blocks.sensorsQuiz } }));
    const completed = await call(
      api.courses.completeBlock({ params: { blockId: DEMO_IDS.blocks.sensorsQuiz }, body: {} }),
    );
    expect(completed.courseProgress.completedBlocks).toBe(2);

    const open = await call(api.assignments.listStudentAssignments({ query: { status: 'open' } }));
    const done = await call(api.assignments.listStudentAssignments({ query: { status: 'done' } }));
    expect(open.items.length).toBe(2);
    expect(done.items.map((a) => a.id)).toEqual([DEMO_IDS.assignments.simpleHomework]);
    const detail = await call(
      api.assignments.getStudentAssignment({
        params: { assignmentId: DEMO_IDS.assignments.simpleHomework },
      }),
    );
    expect(detail.submission?.status).toBe('GRADED');
    const submitted = await call(
      api.assignments.submitAssignment({
        params: { assignmentId: DEMO_IDS.assignments.homework },
        body: { text: 'Готово' },
        headers: { 'idempotency-key': 'k1' },
      }),
    );
    expect(submitted.status).toBe('SUBMITTED');

    const conversations = await call(api.ai.listConversations({ query: { kind: 'TUTOR' } }));
    expect(conversations.items).toHaveLength(1);
    const messages = await call(
      api.ai.listConversationMessages({
        params: { conversationId: DEMO_IDS.conversation },
        query: {},
      }),
    );
    expect(messages.items).toHaveLength(2);
    const trajectory = await call(api.ai.getTrajectory());
    expect(trajectory?.content.nextSteps.length).toBeGreaterThan(0);
    const refresh = await call(api.ai.refreshTrajectory());
    expect(refresh).toEqual({ queued: true });

    const notifications = await call(api.notifications.listNotifications({ query: {} }));
    expect(notifications.unreadCount).toBe(2);
    const afterRead = await call(api.notifications.markNotificationsRead({ body: {} }));
    expect(afterRead.unreadCount).toBe(0);

    const catalog = await call(api.catalog.listClubs({ query: {} }));
    expect(catalog.items).toHaveLength(2);
    expect(catalog.items[0]?.schedulePreview[0]).toMatch(/^Пн /);

    const updated = await call(api.auth.updateSettings({ body: { theme: 'DARK' } }));
    expect(updated.settings.theme).toBe('DARK');
  });

  it('SSE тьютора: токены и done через streamSse', async () => {
    await loginAs('student1');
    const events: AiStreamEvent[] = [];
    await streamSse({
      path: STREAMING_ROUTES.tutorMessage.path(DEMO_IDS.conversation),
      body: { text: 'Что сделать сегодня?' },
      onEvent: (event) => events.push(event),
    });
    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => (e.type === 'token' ? e.text : ''))
      .join('');
    expect(text).toContain('робототехнике');
    expect(events.at(-1)?.type).toBe('done');
    const messages = await call(
      api.ai.listConversationMessages({
        params: { conversationId: DEMO_IDS.conversation },
        query: {},
      }),
    );
    expect(messages.items).toHaveLength(4);
  });

  it('родитель: дети, главная, аналитика, кружки, оплата, карточка преподавателя', async () => {
    await loginAs('parent');
    const children = await call(api.family.listChildren());
    expect(children.items.map((c) => c.student.id).sort()).toEqual(
      [DEMO_IDS.students.alexey, DEMO_IDS.students.dasha].sort(),
    );

    const home = await call(
      api.dashboards.getParentChildHome({ params: { studentId: DEMO_IDS.students.dasha } }),
    );
    expect(home.student.user.firstName).toBe('Даша');
    expect(home.missed).toHaveLength(1);

    const analytics = await call(
      api.dashboards.getParentChildAnalytics({
        params: { studentId: DEMO_IDS.students.alexey },
        query: {},
      }),
    );
    expect(analytics.recentResults).toHaveLength(1);
    expect(analytics.weekly).toHaveLength(4);

    const clubs = await call(
      api.family.listChildClubs({ params: { studentId: DEMO_IDS.students.alexey } }),
    );
    expect(clubs.items).toHaveLength(2);
    expect(
      clubs.items.find((c) => c.enrollmentId === DEMO_IDS.enrollments.alexeyRobotics)?.paidUntil,
    ).toBe('2026-09-30');

    const payments = await call(
      api.payments.getChildPayments({ params: { studentId: DEMO_IDS.students.alexey }, query: {} }),
    );
    expect(payments.history.items[0]?.status).toBe('SUCCEEDED');
    const created = await call(
      api.payments.createPayment({
        params: { studentId: DEMO_IDS.students.alexey },
        body: { enrollmentId: DEMO_IDS.enrollments.alexeyProgramming, periodsCount: 2 },
        headers: { 'idempotency-key': 'pay-1' },
      }),
    );
    expect(created.amount.amountKopecks).toBe(600000);
    const payment = await call(
      api.payments.getPayment({ params: { paymentId: created.paymentId } }),
    );
    expect(payment.status).toBe('PENDING');

    const teacher = await call(
      api.catalog.getTeacherPublicProfile({ params: { teacherId: DEMO_IDS.teachers.maria } }),
    );
    expect(teacher.contacts?.phone).toBeTruthy();
    expect(teacher.clubs).toHaveLength(2);

    await expect(call(api.family.linkChild({ body: { code: 'ALX123' } }))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(call(api.family.linkChild({ body: { code: 'NOPE' } }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('новый родитель: привязка ребёнка по коду и childrenCount', async () => {
    const login = await call(
      api.auth.loginDev({ body: { maxUserId: 'max-new-parent', roles: ['PARENT'] } }),
    );
    session(login);
    expect(login.me.parent?.childrenCount).toBe(0);
    expect((await call(api.family.listChildren())).items).toHaveLength(0);
    const linked = await call(api.family.linkChild({ body: { code: 'alx123' } }));
    expect(linked.student.id).toBe(DEMO_IDS.students.alexey);
    expect((await call(api.auth.getMe())).parent?.childrenCount).toBe(1);
    await call(api.family.unlinkChild({ params: { studentId: DEMO_IDS.students.alexey } }));
    expect((await call(api.family.listChildren())).items).toHaveLength(0);
  });

  it('преподаватель: главная, группы, ученик, курсы, задания, смена роли', async () => {
    await loginAs('teacher');
    const home = await call(api.dashboards.getTeacherHome());
    expect(home.stats.groupsCount).toBe(2);
    expect(home.stats.studentsCount).toBe(2);
    expect(home.groups).toHaveLength(2);
    expect(home.events.length).toBeGreaterThan(0);

    const groups = await call(api.dashboards.listTeacherGroups());
    expect(groups.items[0]?.nextLesson).not.toBeNull();
    const group = await call(
      api.dashboards.getTeacherGroup({ params: { groupId: DEMO_IDS.groups.roboticsA } }),
    );
    expect(group.students).toHaveLength(2);
    expect(group.schedule).toHaveLength(2);
    const dasha = group.students.find((s) => s.student.id === DEMO_IDS.students.dasha);
    expect(dasha?.needsAttention).toContain('Пропуски');

    const card = await call(
      api.dashboards.getTeacherStudent({ params: { studentId: DEMO_IDS.students.alexey } }),
    );
    expect(card.groups).toHaveLength(2);
    expect(card.history).toHaveLength(1);

    const lessons = await call(
      api.groups.listGroupLessons({
        params: { groupId: DEMO_IDS.groups.roboticsA },
        query: { from: '2020-01-01', to: '2099-01-01' },
      }),
    );
    expect(lessons.lessons).toHaveLength(4);
    const cancelled = await call(
      api.groups.updateLesson({
        params: { lessonId: DEMO_IDS.lessons.roboticsNext },
        body: { status: 'CANCELLED', cancelReason: 'Болезнь' },
      }),
    );
    expect(cancelled.status).toBe('CANCELLED');

    const courses = await call(api.courses.listTeacherCourses({ query: {} }));
    expect(courses.items[0]?.blocksCount).toBe(4);
    const created = await call(
      api.courses.createCourse({
        body: { groupId: DEMO_IDS.groups.programmingA, title: 'Python: игры' },
      }),
    );
    expect(created.status).toBe('DRAFT');
    const detail = await call(
      api.courses.getTeacherCourse({ params: { courseId: DEMO_IDS.course } }),
    );
    expect(detail.modules[1]?.blocks[0]?.type).toBe('QUIZ');
    const jobs = await call(api.courseBuilder.listGenerationJobs({ query: {} }));
    expect(jobs.items).toHaveLength(0);

    const assignments = await call(
      api.assignments.listTeacherAssignments({ query: { status: 'open' } }),
    );
    expect(assignments.items.length).toBeGreaterThan(0);
    const submissions = await call(
      api.assignments.listSubmissions({
        params: { assignmentId: DEMO_IDS.assignments.simpleHomework },
      }),
    );
    expect(
      submissions.rows.find((r) => r.student.id === DEMO_IDS.students.alexey)?.submission?.status,
    ).toBe('GRADED');

    const switched = await call(api.auth.switchRole({ body: { role: 'PARENT' } }));
    expect(switched.me.activeRole).toBe('PARENT');
    session(switched);
    expect((await call(api.family.listChildren())).items.map((c) => c.student.id)).toEqual([
      DEMO_IDS.students.dasha,
    ]);
    await expect(call(api.dashboards.getTeacherHome())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(call(api.auth.switchRole({ body: { role: 'STUDENT' } }))).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it('refresh выдаёт новую пару, logout — 204, dev-вход новым пользователем без онбординга', async () => {
    const login = await loginAs('student2');
    expect(login.me.student?.onboardingCompleted).toBe(false);
    const pair = await call(api.auth.refresh({ body: { refreshToken: login.refreshToken } }));
    expect(pair.accessToken).not.toBe(login.accessToken);
    const logout = await api.auth.logout({ body: { refreshToken: login.refreshToken } });
    expect(logout.status).toBe(204);

    const fresh = await call(
      api.auth.loginDev({ body: { maxUserId: 'max-new-student', roles: ['STUDENT'] } }),
    );
    session(fresh);
    expect(fresh.me.needsRoleSetup).toBe(false);
    expect(fresh.me.student?.onboardingCompleted).toBe(false);
    const done = await call(
      api.ai.completeOnboarding({
        body: {
          selectedClubIds: [DEMO_IDS.clubs.robotics],
          profileDraft: {
            interests: ['роботы'],
            goals: [],
            weeklyHours: 2,
            preferredFormats: [],
            summary: '',
          },
        },
      }),
    );
    expect(done.student?.onboardingCompleted).toBe(true);
    expect((await call(api.dashboards.getStudentHome())).clubs).toHaveLength(1);
  });
  it(
    'преподаватель: генерация курса по теме в mock проходит стадии до READY и принимается',
    { timeout: 15_000 },
    async () => {
      await loginAs('teacher');
      const job = await call(
        api.courseBuilder.createGenerationJob({
          body: {
            groupId: DEMO_IDS.groups.programmingA,
            topic: 'Циклы в Python: практика на списках',
          },
        }),
      );
      expect(job).toMatchObject({ stage: 'QUEUED', sourceKind: 'TOPIC' });
      let current = job;
      for (let i = 0; i < 30 && current.stage !== 'READY'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        current = await call(api.courseBuilder.getGenerationJob({ params: { jobId: job.id } }));
      }
      expect(current.stage).toBe('READY');
      expect(current.knowledge?.nodes.length).toBeGreaterThan(0);
      expect(current.draft?.modules.length).toBeGreaterThan(0);
      const accepted = await call(
        api.courseBuilder.acceptGenerationJob({ params: { jobId: job.id } }),
      );
      const course = await call(
        api.courses.getTeacherCourse({ params: { courseId: accepted.courseId } }),
      );
      expect(course.status).toBe('DRAFT');
      expect(course.modules.length).toBe(current.draft?.modules.length);
    },
  );
});
