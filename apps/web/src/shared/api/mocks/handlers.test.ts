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
import { db, resetMockDb } from './state';
import { MOCK_IDS, MOCK_INVITE_TOKENS } from './world-extras';

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
