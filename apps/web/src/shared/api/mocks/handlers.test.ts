// @vitest-environment node
/**
 * Сквозная проверка демо-мира: реальный ts-rest клиент + MSW в Node. Гарантирует, что в
 * `VITE_API_MODE=mock` все хуки страниц получают данные, прошедшие схемы контракта.
 */
import {
  STREAMING_ROUTES,
  TEACHER_PERFORMANCE_PERIODS,
  TEACHER_WALLET_PERIODS,
  type AiStreamEvent,
  type Role,
  type TeacherPerformancePeriod,
  type TeacherWalletPeriod,
  type TeacherWalletTransaction,
  type TokenPair,
} from '@edu/contracts';
import { DEMO_IDS, demoUsers } from '@edu/contracts/fixtures';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, startOfDay, toDateOnly } from '../../lib/dates';
import { api, call, setApiAuthAdapter } from '../client';
import { ApiClientError } from '../errors';
import { streamSse } from '../sse';
import { handlers } from './handlers';
import { db, resetMockDb } from './state';
import { MOCK_IDS, MOCK_INVITE_TOKENS, DEMO_TEACHER_WITHDRAWAL_KOPECKS } from './world-extras';

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

/** Dev-вход по maxUserId: Андрей из мок-мира (`max-teacher-2`) и новые пользователи. */
async function loginDev(maxUserId: string, role: Role) {
  const result = await call(api.auth.loginDev({ body: { maxUserId, roles: [role] } }));
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
    // «Успеваемость»: неделя посещений и только настоящие задания — сгенерированные для
    // аналитики родителя ученик не видит (клетка открывает /student/assignments/:id).
    expect(profile.week).toHaveLength(7);
    const profileTasks = profile.clubHomework?.flatMap((club) => club.tasks) ?? [];
    expect(profileTasks.length).toBeGreaterThan(0);
    expect(
      profileTasks.every((task) => db.assignments.some((a) => a.id === task.assignmentId)),
    ).toBe(true);
    const totals = profile.homework!;
    expect(totals.correct + totals.wrong + totals.upcoming).toBe(profileTasks.length);

    const calendar = await call(
      api.groups.getStudentCalendar({ query: { from: '2020-01-01', to: '2099-01-01' } }),
    );
    // 5 занятий из фикстур + Python сегодня в 12:00 (world-extras, расписание дня репетитора).
    expect(calendar.lessons).toHaveLength(6);
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
    // 2 кружка из фикстур + шахматы, математика и английский из world-extras.
    expect(catalog.items).toHaveLength(5);
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
    // Робототехника (фикстуры) + шахматы (world-extras).
    expect(home.missed).toHaveLength(2);

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

  it('родитель: аналитика заданий, прогресс за окно, задания группы, политика связи', async () => {
    await loginAs('parent');
    const alexey = DEMO_IDS.students.alexey;

    const analytics = await call(
      api.dashboards.getParentChildAnalytics({ params: { studentId: alexey }, query: {} }),
    );
    expect(analytics.week).toHaveLength(7);
    expect(analytics.week?.filter((d) => d.status === 'TODAY')).toHaveLength(1);
    const robotics = analytics.clubHomework?.find((c) => c.group.id === DEMO_IDS.groups.roboticsA);
    const programming = analytics.clubHomework?.find(
      (c) => c.group.id === DEMO_IDS.groups.programmingA,
    );
    expect(robotics?.tasks).toHaveLength(45);
    expect(programming?.tasks).toHaveLength(30);
    expect(robotics?.tasks.map((t) => t.number)).toEqual(
      Array.from({ length: 45 }, (_, i) => i + 1),
    );
    // В сетке есть все четыре цвета: зелёный, красный, жёлтый, серый.
    expect(new Set(robotics?.tasks.map((t) => t.status))).toEqual(
      new Set(['DONE', 'FAILED', 'SOON', 'LATER']),
    );
    // Настоящая сдача Алексея (85 из 100) — зелёная клетка.
    expect(
      programming?.tasks.find((t) => t.assignmentId === DEMO_IDS.assignments.simpleHomework),
    ).toMatchObject({ status: 'DONE', scorePercent: 85 });
    for (const club of analytics.clubHomework ?? []) {
      const { correct, wrong, upcoming } = club.counts;
      expect(correct + wrong + upcoming).toBe(club.tasks.length);
      expect(correct).toBe(club.tasks.filter((t) => t.status === 'DONE').length);
    }
    expect(analytics.homework).toEqual({
      correct: robotics!.counts.correct + programming!.counts.correct,
      wrong: robotics!.counts.wrong + programming!.counts.wrong,
      upcoming: robotics!.counts.upcoming + programming!.counts.upcoming,
    });
    // Детерминированно: повторный запрос — та же картина.
    const again = await call(
      api.dashboards.getParentChildAnalytics({ params: { studentId: alexey }, query: {} }),
    );
    expect(again.clubHomework).toEqual(analytics.clubHomework);

    const tasks = await call(
      api.dashboards.getParentChildGroupTasks({
        params: { studentId: alexey, groupId: DEMO_IDS.groups.roboticsA },
      }),
    );
    expect(tasks.group.club.title).toBe('Робототехника');
    expect(tasks.items.map((t) => t.assignmentId)).toEqual(
      robotics?.tasks.map((t) => t.assignmentId),
    );
    expect(tasks.items.some((t) => t.code?.language === 'python')).toBe(true);
    expect(tasks.items.some((t) => t.code?.language === 'cpp')).toBe(true);
    const wrongAnswer = tasks.items.find((t) => t.status === 'FAILED' && t.answer);
    expect(wrongAnswer?.correctAnswer).toBeTruthy();
    expect(wrongAnswer?.answer).not.toBe(wrongAnswer?.correctAnswer);
    expect(tasks.items.find((t) => t.status === 'SOON')).toMatchObject({
      answer: null,
      score: null,
    });
    await expect(
      call(
        api.dashboards.getParentChildGroupTasks({
          params: { studentId: alexey, groupId: MOCK_IDS.groups.chessA },
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const byDays = await Promise.all(
      ([1, 7, 30] as const).map((days) =>
        call(
          api.dashboards.getParentChildHomeworkProgress({
            params: { studentId: alexey },
            query: { days },
          }),
        ),
      ),
    );
    const [d1, d7, d30] = byDays;
    expect(d7?.days).toBe(7);
    expect(d30?.items).toHaveLength(2);
    d30?.items.forEach((item, i) => {
      expect(d1!.items[i]!.done).toBeLessThanOrEqual(d7!.items[i]!.done);
      expect(d7!.items[i]!.done).toBeLessThanOrEqual(item.done);
      expect(d7!.items[i]!.recommended).toBeLessThanOrEqual(item.recommended);
      expect(item.recommended).toBeGreaterThan(0);
    });
    const byDefault = await call(
      api.dashboards.getParentChildHomeworkProgress({ params: { studentId: alexey }, query: {} }),
    );
    expect(byDefault).toEqual(d7);

    // Даша: робототехника + шахматы (шахматы есть только в моках) — как в макете.
    const dasha = await call(
      api.dashboards.getParentChildHomeworkProgress({
        params: { studentId: DEMO_IDS.students.dasha },
        query: { days: 30 },
      }),
    );
    expect(dasha.items.map((i) => i.club.title).sort()).toEqual(['Робототехника', 'Шахматы']);

    // Мария-родитель привязана только к Даше: Алексей для неё — чужой ребёнок.
    await loginAs('teacher', 'PARENT');
    await expect(
      call(
        api.dashboards.getParentChildHomeworkProgress({
          params: { studentId: alexey },
          query: {},
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      call(
        api.dashboards.getParentChildGroupTasks({
          params: { studentId: alexey, groupId: DEMO_IDS.groups.roboticsA },
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('родитель: кошелёк-заглушка и фото профиля', async () => {
    await loginAs('parent');
    const wallet = await call(api.payments.getWallet());
    expect(wallet.balance).toEqual({ amountKopecks: 670_000, currency: 'RUB' });
    const topUp = () =>
      call(
        api.payments.topUpWallet({
          body: { amountKopecks: 50_000 },
          headers: { 'idempotency-key': 'top-up-1' },
        }),
      );
    expect((await topUp()).balance.amountKopecks).toBe(720_000);
    // Повтор с тем же ключом не зачисляет второй раз.
    expect((await topUp()).balance.amountKopecks).toBe(720_000);
    expect((await call(api.payments.getWallet())).balance.amountKopecks).toBe(720_000);
    await expect(
      call(
        api.payments.topUpWallet({
          body: { amountKopecks: 100 },
          headers: { 'idempotency-key': 'top-up-2' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const target = await call(
      api.files.createUploadUrl({
        body: { fileName: 'me.png', mime: 'image/png', sizeBytes: 4, purpose: 'AVATAR' },
      }),
    );
    await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: target.headers,
      body: new Uint8Array([137, 80, 78, 71]),
    });
    const file = await call(api.files.confirmUpload({ params: { fileId: target.fileId } }));
    const download = await fetch(file.url!);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    const me = await call(api.auth.updateAvatar({ body: { fileId: target.fileId } }));
    expect(me.user.avatarUrl).toMatch(/^blob:/);
    expect((await call(api.auth.getMe())).user.avatarUrl).toBe(me.user.avatarUrl);
    const cleared = await call(api.auth.updateAvatar({ body: { fileId: null } }));
    expect(cleared.user.avatarUrl).toBeNull();
    await expect(
      call(api.auth.updateAvatar({ body: { fileId: DEMO_IDS.course } })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('приглашение ребёнка по ссылке: создание, просмотр, принятие, ошибки', async () => {
    await loginAs('parent');
    const invite = await call(api.family.createChildInvite());
    expect(invite.token.length).toBeGreaterThanOrEqual(16);
    expect(invite.url).toBe(`http://localhost/invite/${invite.token}`);
    // Роль не та — 403.
    await expect(
      call(api.family.getParentInvite({ params: { token: invite.token } })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const kid = await call(
      api.auth.loginDev({ body: { maxUserId: 'max-invited-kid', roles: ['STUDENT'] } }),
    );
    session(kid);
    const seen = await call(api.family.getParentInvite({ params: { token: invite.token } }));
    expect(seen).toMatchObject({ status: 'PENDING', parent: { firstName: 'Ольга' } });
    const accepted = await call(api.family.acceptParentInvite({ params: { token: invite.token } }));
    expect(accepted).toMatchObject({ linkStatus: 'ACTIVE', parent: { lastName: 'Смирнова' } });
    // Повтор тем же ребёнком — идемпотентно.
    await call(api.family.acceptParentInvite({ params: { token: invite.token } }));
    expect(
      (await call(api.family.getParentInvite({ params: { token: invite.token } }))).status,
    ).toBe('ACCEPTED');
    await expect(
      call(api.family.acceptParentInvite({ params: { token: MOCK_INVITE_TOKENS.expired } })),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    expect(
      (await call(api.family.getParentInvite({ params: { token: MOCK_INVITE_TOKENS.expired } })))
        .status,
    ).toBe('EXPIRED');
    await expect(
      call(api.family.getParentInvite({ params: { token: 'no-such-invite' } })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Чужое уже принятое приглашение — конфликт; действующее от Марии Алексей принимает.
    await loginAs('student1');
    await expect(
      call(api.family.acceptParentInvite({ params: { token: invite.token } })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const fromMaria = await call(
      api.family.acceptParentInvite({ params: { token: MOCK_INVITE_TOKENS.pending } }),
    );
    expect(fromMaria.parent.firstName).toBe('Мария');

    await loginAs('parent');
    expect((await call(api.family.listChildren())).items).toHaveLength(3);

    // Своё приглашение принять нельзя (пользователь и родитель, и ученик).
    const both = await call(
      api.auth.loginDev({ body: { maxUserId: 'max-both-roles', roles: ['PARENT', 'STUDENT'] } }),
    );
    session(both);
    const own = await call(api.family.createChildInvite());
    session(await call(api.auth.switchRole({ body: { role: 'STUDENT' } })));
    await expect(
      call(api.family.acceptParentInvite({ params: { token: own.token } })),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });

  it('приглашение: уже привязанный не тратит ссылку, отвязанного принятая ссылка не возвращает', async () => {
    // Алексей уже привязан к Ольге: её новая ссылка остаётся PENDING для другого ребёнка.
    await loginAs('parent');
    const invite = await call(api.family.createChildInvite());
    await loginAs('student1');
    await expect(
      call(api.family.acceptParentInvite({ params: { token: invite.token } })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      (await call(api.family.getParentInvite({ params: { token: invite.token } }))).status,
    ).toBe('PENDING');

    // Новый ребёнок принимает, родитель его отвязывает — повтор accept связь не восстанавливает.
    const kid = await call(
      api.auth.loginDev({ body: { maxUserId: 'max-unlinked-kid', roles: ['STUDENT'] } }),
    );
    session(kid);
    await call(api.family.acceptParentInvite({ params: { token: invite.token } }));
    await loginAs('parent');
    const linked = (await call(api.family.listChildren())).items.find(
      (item) => item.student.user.firstName === 'max-unlinked-kid',
    );
    expect(linked?.linkStatus).toBe('ACTIVE');
    await call(api.family.unlinkChild({ params: { studentId: linked!.student.id } }));

    session(kid);
    await expect(
      call(api.family.acceptParentInvite({ params: { token: invite.token } })),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    await loginAs('parent');
    expect(
      (await call(api.family.listChildren())).items.some(
        (item) => item.student.id === linked!.student.id,
      ),
    ).toBe(false);
  });

  it(
    'тьютор родителя: диалоги по ребёнку и SSE-ответ про его успехи',
    { timeout: 20_000 },
    async () => {
      await loginAs('parent');
      const alexeyChats = await call(
        api.ai.listParentConversations({
          params: { studentId: DEMO_IDS.students.alexey },
          query: {},
        }),
      );
      expect(alexeyChats.items).toHaveLength(1);
      const history = await call(
        api.ai.listParentConversationMessages({
          params: { conversationId: alexeyChats.items[0]!.id },
          query: {},
        }),
      );
      expect(history.items).toHaveLength(2);

      const chat = await call(
        api.ai.createParentConversation({ params: { studentId: DEMO_IDS.students.dasha } }),
      );
      expect(chat.kind).toBe('TUTOR');
      const ask = async (text: string) => {
        const events: AiStreamEvent[] = [];
        await streamSse({
          path: STREAMING_ROUTES.parentTutorMessage.path(chat.id),
          body: { text },
          onEvent: (event) => events.push(event),
        });
        expect(events.at(-1)?.type).toBe('done');
        return events.map((e) => (e.type === 'token' ? e.text : '')).join('');
      };
      const summary = await ask('Как Даша занимается в последнее время?');
      expect(summary).toContain('Даша посещает');
      expect(summary).toMatch(/Шахматы|Робототехника/);
      expect(await ask('Какие задания просрочены?')).toMatch(/просроч/i);
      expect(await ask('Где нужна помощь?')).toMatch(/ошибок|трудностей/);
      expect(await ask('Как поддержать мотивацию?')).toContain('кристаллов на счету');
      const messages = await call(
        api.ai.listParentConversationMessages({ params: { conversationId: chat.id }, query: {} }),
      );
      expect(messages.items).toHaveLength(8);
      expect(
        (
          await call(
            api.ai.listParentConversations({
              params: { studentId: DEMO_IDS.students.dasha },
              query: {},
            }),
          )
        ).items[0]?.id,
      ).toBe(chat.id);

      // Чужому родителю диалоги о ребёнке недоступны.
      await loginAs('teacher', 'PARENT');
      await expect(
        call(
          api.ai.listParentConversations({
            params: { studentId: DEMO_IDS.students.alexey },
            query: {},
          }),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        call(
          api.ai.listParentConversationMessages({ params: { conversationId: chat.id }, query: {} }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    },
  );

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

  it('преподаватель: коды групп, расписание дня и календарь всех групп', async () => {
    await loginAs('teacher');
    const home = await call(api.dashboards.getTeacherHome());
    // Сегодня у Марии два занятия: Python (012) в 12:00 и робототехника (001) в 15:00.
    expect(home.today.map((l) => l.group.code)).toEqual(['012', '001']);
    expect(home.groups.map((g) => g.code)).toEqual(['001', '012']);

    const all = await call(
      api.groups.getTeacherCalendar({ query: { from: '2020-01-01', to: '2099-01-01' } }),
    );
    // Робототехника — 4 занятия, Python — сегодня и завтра; шахматы Андрея не видны.
    expect(all.lessons).toHaveLength(6);
    expect(new Set(all.lessons.map((l) => l.group.code))).toEqual(new Set(['001', '012']));
    const starts = all.lessons.map((l) => l.startsAt);
    expect(starts).toEqual([...starts].sort());
    expect(all.lessons.every((l) => l.attendance === undefined)).toBe(true);
    const today = toDateOnly(new Date());
    const day = await call(api.groups.getTeacherCalendar({ query: { from: today, to: today } }));
    expect(day.lessons.map((l) => l.id)).toEqual([
      MOCK_IDS.lessons.programmingToday,
      DEMO_IDS.lessons.roboticsToday,
    ]);
    await expect(
      call(api.groups.getTeacherCalendar({ query: { from: '23.09.2026' } })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    // Код группы отдаётся везде, где есть GroupBrief: у родителя — в занятиях Даши.
    await loginAs('parent');
    const dasha = await call(
      api.groups.getParentChildCalendar({
        params: { studentId: DEMO_IDS.students.dasha },
        query: { from: '2020-01-01', to: '2099-01-01' },
      }),
    );
    expect(new Set(dasha.lessons.map((l) => l.group.code))).toEqual(new Set(['001', '003']));
    await expect(call(api.groups.getTeacherCalendar({ query: {} }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('преподаватель: успеваемость ученика и его задания — только по своим группам', async () => {
    const { alexey, dasha } = DEMO_IDS.students;
    const { roboticsA, programmingA } = DEMO_IDS.groups;
    await loginAs('teacher');
    const card = await call(api.dashboards.getTeacherStudent({ params: { studentId: alexey } }));
    expect(card.week).toHaveLength(7);
    expect(card.week?.filter((d) => d.status === 'TODAY')).toHaveLength(1);
    expect(card.clubHomework?.map((c) => c.group.code)).toEqual(['001', '012']);
    // Преподаватель видит те же задания и статусы, что родитель (порог «неправильно» — < 30%).
    const robotics = card.clubHomework?.find((c) => c.group.id === roboticsA);
    expect(robotics?.tasks).toHaveLength(45);
    expect(card.clubHomework?.find((c) => c.group.id === programmingA)?.tasks).toHaveLength(30);
    const counts = card.clubHomework!.map((c) => c.counts);
    expect(card.homework).toEqual({
      correct: counts.reduce((sum, c) => sum + c.correct, 0),
      wrong: counts.reduce((sum, c) => sum + c.wrong, 0),
      upcoming: counts.reduce((sum, c) => sum + c.upcoming, 0),
    });

    // Даша ходит и на шахматы к Андрею — у Марии видна только робототехника.
    const dashaCard = await call(
      api.dashboards.getTeacherStudent({ params: { studentId: dasha } }),
    );
    expect(dashaCard.groups.map((g) => g.id)).toEqual([roboticsA]);
    expect(dashaCard.clubHomework?.map((c) => c.group.id)).toEqual([roboticsA]);

    const tasks = await call(
      api.dashboards.getTeacherStudentGroupTasks({
        params: { studentId: alexey, groupId: roboticsA },
      }),
    );
    expect(tasks.group.code).toBe('001');
    expect(tasks.items.map((t) => [t.assignmentId, t.status])).toEqual(
      robotics?.tasks.map((t) => [t.assignmentId, t.status]),
    );
    const wrong = tasks.items.find((t) => t.status === 'FAILED' && t.answer);
    expect(wrong?.correctAnswer).toBeTruthy();
    const tasksOf = (studentId: string, groupId: string) =>
      call(api.dashboards.getTeacherStudentGroupTasks({ params: { studentId, groupId } }));
    // Чужая группа и группа, где ученик не занимается, — 403; нет ученика или группы — тоже 403:
    // для преподавателя «нет» и «не ваш» неразличимы, а 404 фронт покажет «раздел в разработке».
    await expect(tasksOf(dasha, MOCK_IDS.groups.chessA)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(tasksOf(dasha, programmingA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tasksOf(DEMO_IDS.course, roboticsA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tasksOf(alexey, DEMO_IDS.course)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      call(api.dashboards.getTeacherStudent({ params: { studentId: DEMO_IDS.course } })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      call(api.dashboards.getTeacherGroup({ params: { groupId: DEMO_IDS.course } })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Та же картина, что в аналитике родителя.
    await loginAs('parent');
    const parentView = await call(
      api.dashboards.getParentChildAnalytics({ params: { studentId: alexey }, query: {} }),
    );
    expect(parentView.clubHomework).toEqual(card.clubHomework);

    // Андрей ведёт шахматы: Алексей ему чужой, задания Даши по шахматам — видны.
    await loginDev('max-teacher-2', 'TEACHER');
    await expect(
      call(api.dashboards.getTeacherStudent({ params: { studentId: alexey } })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tasksOf(alexey, roboticsA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const chess = await tasksOf(dasha, MOCK_IDS.groups.chessA);
    expect(chess.group.code).toBe('003');
    expect(chess.items).toHaveLength(45);
  });

  it('преподаватель: общая успеваемость по периодам', async () => {
    await loginAs('teacher');
    const dtos = await Promise.all(
      TEACHER_PERFORMANCE_PERIODS.map((period) =>
        call(api.dashboards.getTeacherPerformance({ query: { period } })),
      ),
    );
    dtos.forEach((dto, i) => {
      expect(dto.period).toBe(TEACHER_PERFORMANCE_PERIODS[i]);
      expect(dto.from < dto.to).toBe(true);
      expect(dto.groups.map((row) => [row.group.code, row.studentsCount])).toEqual([
        ['001', 2],
        ['012', 1],
      ]);
      for (const row of dto.groups) {
        expect(row.homeworkCorrect).toBeLessThanOrEqual(row.homeworkDone);
      }
    });
    const [day, week, month, course] = dtos;
    // day — с начала сегодняшнего дня, 7 дней — включая сегодня, курс — с 1 сентября.
    expect(new Date(day!.from)).toEqual(startOfDay());
    expect(new Date(week!.from)).toEqual(startOfDay(addDays(new Date(), -6)));
    const now = new Date();
    const courseYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    expect(new Date(course!.from)).toEqual(new Date(courseYear, 8, 1));
    // Периоды вложены: день ⊂ 7 дней ⊂ 30 дней — счётчики не убывают.
    const keys = ['attended', 'missed', 'homeworkDone', 'homeworkCorrect'] as const;
    day!.groups.forEach((row, i) => {
      for (const key of keys) {
        expect(row[key]).toBeLessThanOrEqual(week!.groups[i]![key]);
        expect(week!.groups[i]![key]).toBeLessThanOrEqual(month!.groups[i]![key]);
      }
    });
    // За 30 дней у робототехники есть настоящие отметки: Алексей был дважды, Даша раз пропустила
    // и раз опоздала (опоздание — посещение).
    const robotics = month!.groups[0]!;
    expect(robotics.attended).toBeGreaterThanOrEqual(3);
    expect(robotics.missed).toBeGreaterThanOrEqual(1);
    expect(robotics.homeworkDone).toBeGreaterThan(robotics.homeworkCorrect);
    expect(robotics.homeworkCorrect).toBeGreaterThan(0);

    const byDefault = await call(api.dashboards.getTeacherPerformance({ query: {} }));
    expect(byDefault.period).toBe('day');
    expect(byDefault.groups).toEqual(day!.groups);
    await expect(
      call(
        api.dashboards.getTeacherPerformance({
          query: { period: 'year' as TeacherPerformancePeriod },
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    // У Андрея в математике учеников нет — строка с нулями.
    await loginDev('max-teacher-2', 'TEACHER');
    const andrey = await call(
      api.dashboards.getTeacherPerformance({ query: { period: 'course' } }),
    );
    expect(andrey.groups.map((row) => row.group.code)).toEqual(['003', '007']);
    expect(andrey.groups[1]).toMatchObject({
      studentsCount: 0,
      attended: 0,
      missed: 0,
      homeworkDone: 0,
      homeworkCorrect: 0,
    });
    await loginAs('student1');
    await expect(call(api.dashboards.getTeacherPerformance({ query: {} }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('преподаватель: посещения — только отметки журнала, без выдуманных и двойного счёта', async () => {
    // Только Date: «сейчас» — среда 23.09.2026; MSW и таймеры остаются настоящими.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const perf = async (period: TeacherPerformancePeriod) =>
        (await call(api.dashboards.getTeacherPerformance({ query: { period } }))).groups.map(
          (row) => [row.group.code, row.attended, row.missed],
        );

      // 11:00 — сегодняшние Python (12:00) и робототехника (15:00) не начались: нулей не выдумываем.
      vi.setSystemTime(new Date(2026, 8, 23, 11, 0));
      resetMockDb();
      await loginAs('teacher');
      expect(await perf('day')).toEqual([
        ['001', 0, 0],
        ['012', 0, 0],
      ]);

      // 16:00 — оба прошли и отмечены: Алексей был везде, Даша — по уважительной (пропуск).
      vi.setSystemTime(new Date(2026, 8, 23, 16, 0));
      resetMockDb();
      await loginAs('teacher');
      expect(await perf('day')).toEqual([
        ['001', 1, 1],
        ['012', 1, 0],
      ]);
      // 7 дней (17–23.09): у робототехники настоящие 20.09 и сегодня + синтетический понедельник
      // 21.09 по правилу (по 2 ученика). Четверг 17.09 не дополняется: занятие правила «чт» на
      // этой неделе уже в журнале (20.09). У Python — синтетический вторник 22.09 и сегодня.
      const total = (rows: Awaited<ReturnType<typeof perf>>) =>
        rows.map(([code, attended, missed]) => [code, Number(attended) + Number(missed)]);
      expect(total(await perf('week'))).toEqual([
        ['001', 6],
        ['012', 2],
      ]);

      // Ушедший из группы ученик: его настоящие отметки остаются в счётчиках (docs/04 §4.6).
      db.enrollments.find((e) => e.id === DEMO_IDS.enrollments.dashaRobotics)!.status = 'LEFT';
      expect(await perf('day')).toEqual([
        ['001', 1, 1],
        ['012', 1, 0],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('преподаватель: кошелёк — график, транзакции, «Вам должны» и вывод (заглушка)', async () => {
    await loginAs('teacher');
    const day = await call(api.payments.getTeacherWallet({ query: {} }));
    expect(day.period).toBe('day');
    expect(day.balance).toEqual({ amountKopecks: 670_000, currency: 'RUB' });
    // Скользящее окно 24 часа, точки каждые 4 часа; последняя — текущий баланс.
    expect(new Date(day.to).getTime() - new Date(day.from).getTime()).toBe(24 * 3_600_000);
    expect(day.history[0]?.at).toBe(day.from);
    expect(day.history.at(-1)).toEqual({ at: day.to, balance: day.balance });

    const signed = (tx: TeacherWalletTransaction) =>
      tx.kind === 'INCOME' ? tx.amount.amountKopecks : -tx.amount.amountKopecks;
    const wallets = await Promise.all(
      TEACHER_WALLET_PERIODS.map((period) =>
        call(api.payments.getTeacherWallet({ query: { period } })),
      ),
    );
    expect(wallets.map((w) => w.history.length)).toEqual([7, 8, 31]);
    for (const wallet of wallets) {
      // Баланс на начало окна + операции окна = текущий; нигде не отрицательный.
      expect(
        wallet.history[0]!.balance.amountKopecks +
          wallet.transactions.reduce((sum, tx) => sum + signed(tx), 0),
      ).toBe(wallet.balance.amountKopecks);
      expect(wallet.history.every((p) => p.balance.amountKopecks >= 0)).toBe(true);
      const times = wallet.transactions.map((tx) => tx.at);
      expect(times).toEqual([...times].sort().reverse());
      for (const tx of wallet.transactions) {
        expect(tx.at > wallet.from && tx.at <= wallet.to).toBe(true);
        if (tx.kind === 'WITHDRAWAL') expect([tx.group, tx.student]).toEqual([null, null]);
        else expect(['001', '012']).toContain(tx.group?.code);
      }
    }
    const month = wallets[2]!;
    // Вчерашний вывод 12 388 ₽ из макета и поступления от учеников за месяц.
    expect(
      month.transactions.filter(
        (tx) =>
          tx.kind === 'WITHDRAWAL' && tx.amount.amountKopecks === DEMO_TEACHER_WITHDRAWAL_KOPECKS,
      ),
    ).toHaveLength(1);
    expect(month.transactions.filter((tx) => tx.kind === 'INCOME').length).toBeGreaterThan(10);

    // Поступления — не раньше зачисления ученика, сумма — цена кружка (docs/04).
    const enrolledAt = new Map(db.enrollments.map((e) => [`${e.groupId}:${e.studentId}`, e]));
    for (const tx of month.transactions.filter((item) => item.kind === 'INCOME')) {
      const enrollment = enrolledAt.get(`${tx.group!.id}:${tx.student!.id}`)!;
      expect(tx.at >= enrollment.enrolledAt).toBe(true);
      expect(tx.amount.amountKopecks).toBe(tx.group!.code === '001' ? 350_000 : 300_000);
    }

    // «Вам должны»: зачисления в группы Марии по возрастанию даты. Робототехника Алексея
    // оплачена по 30.09 — следующий платёж 01.10, 3 500 ₽. Даша и Python Алексея заплатили с
    // последним поступлением — оплачено 30 дней с его дня, следующий платёж не просрочен.
    const dues = day.debts.map((d) => d.dueAt);
    expect(dues).toEqual([...dues].sort());
    expect(day.debts.map((d) => d.id).sort()).toEqual(
      [
        DEMO_IDS.enrollments.alexeyRobotics,
        DEMO_IDS.enrollments.dashaRobotics,
        DEMO_IDS.enrollments.alexeyProgramming,
      ].sort(),
    );
    expect(day.debts[0]).toMatchObject({
      id: DEMO_IDS.enrollments.alexeyRobotics,
      dueAt: '2026-10-01',
      amount: { amountKopecks: 350_000 },
      group: { code: '001' },
      student: { id: DEMO_IDS.students.alexey },
    });
    const paidByIncome = [
      DEMO_IDS.enrollments.dashaRobotics,
      DEMO_IDS.enrollments.alexeyProgramming,
    ];
    for (const id of paidByIncome) {
      const enrollment = db.enrollments.find((e) => e.id === id)!;
      const lastIncome = month.transactions.find(
        (tx) =>
          tx.kind === 'INCOME' &&
          tx.group?.id === enrollment.groupId &&
          tx.student?.id === enrollment.studentId,
      )!;
      const debt = day.debts.find((d) => d.id === id)!;
      expect(debt.dueAt).toBe(toDateOnly(addDays(lastIncome.at, 30)));
      expect(debt.dueAt > toDateOnly(new Date())).toBe(true);
    }

    const withdraw = (amountKopecks: number, key: string) =>
      call(
        api.payments.withdrawTeacherWallet({
          body: { amountKopecks },
          headers: { 'idempotency-key': key },
        }),
      );
    const first = await withdraw(200_000, 'w-1');
    expect(first.balance.amountKopecks).toBe(470_000);
    expect(first.transaction).toMatchObject({
      kind: 'WITHDRAWAL',
      amount: { amountKopecks: 200_000 },
      group: null,
      student: null,
    });
    // Повтор с тем же ключом не списывает второй раз; тот же ключ с другой суммой — конфликт.
    expect(await withdraw(200_000, 'w-1')).toEqual(first);
    await expect(withdraw(300_000, 'w-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    const after = await call(api.payments.getTeacherWallet({ query: { period: 'day' } }));
    expect(after.balance.amountKopecks).toBe(470_000);
    expect(after.transactions[0]?.id).toBe(first.transaction.id);
    expect(after.history.at(-1)?.balance.amountKopecks).toBe(470_000);
    // Меньше 100 ₽ — VALIDATION, больше баланса — BUSINESS_RULE; весь остаток — можно.
    await expect(withdraw(9_999, 'w-2')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(withdraw(470_001, 'w-3')).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    expect((await withdraw(470_000, 'w-4')).balance.amountKopecks).toBe(0);
    await expect(
      call(api.payments.getTeacherWallet({ query: { period: 'course' as TeacherWalletPeriod } })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    // Родителю кошелёк преподавателя недоступен; его следующий платёж — тот же, что у Марии в
    // «Вам должны», а не «сегодня».
    await loginAs('parent');
    await expect(call(api.payments.getTeacherWallet({ query: {} }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const dasha = await call(
      api.payments.getChildPayments({ params: { studentId: DEMO_IDS.students.dasha }, query: {} }),
    );
    expect(
      dasha.periods.find((p) => p.enrollmentId === DEMO_IDS.enrollments.dashaRobotics)
        ?.nextPaymentAt,
    ).toBe(day.debts.find((d) => d.id === DEMO_IDS.enrollments.dashaRobotics)?.dueAt);
    expect(dasha.history.items[0]).toMatchObject({
      status: 'SUCCEEDED',
      amount: { amountKopecks: 350_000 },
    });
  });

  it('новый преподаватель: пустой кошелёк, нет групп, занятий и долгов', async () => {
    await loginDev('max-new-teacher', 'TEACHER');
    const wallet = await call(api.payments.getTeacherWallet({ query: { period: 'month' } }));
    expect(wallet.balance.amountKopecks).toBe(0);
    expect(wallet.transactions).toEqual([]);
    expect(wallet.debts).toEqual([]);
    expect(wallet.history).toHaveLength(31);
    expect(wallet.history.every((p) => p.balance.amountKopecks === 0)).toBe(true);
    await expect(
      call(
        api.payments.withdrawTeacherWallet({
          body: { amountKopecks: 10_000 },
          headers: { 'idempotency-key': 'new-1' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    const performance = await call(
      api.dashboards.getTeacherPerformance({ query: { period: 'course' } }),
    );
    expect(performance.groups).toEqual([]);
    expect((await call(api.groups.getTeacherCalendar({ query: {} }))).lessons).toEqual([]);
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
    // Рекомендации — только кружки с подходящими причинами, без дополнительных кружков демо-мира.
    const recommendations = await call(api.ai.getOnboardingRecommendations());
    expect(recommendations.items.map((item) => item.club.id)).toEqual([
      DEMO_IDS.clubs.robotics,
      DEMO_IDS.clubs.programming,
    ]);
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
