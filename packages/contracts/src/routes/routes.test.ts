import { type AppRoute, type AppRouter, initClient, isAppRoute } from '@ts-rest/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { GroupBriefSchema } from '../entities';
import { API_PREFIX, type ApiContract, apiContract } from '../index';
import { hasPermission } from '../permissions';
import { AuthResultSchema, type MeDto, UpdateTeacherProfileBodySchema } from './auth';
import {
  ChildAnalyticsDtoSchema,
  HomeworkProgressQuerySchema,
  HomeworkTaskDetailSchema,
  StudentHomeDtoSchema,
  StudentProfileDtoSchema,
  TEACHER_PERFORMANCE_DEFAULT_PERIOD,
  TeacherPerformanceDtoSchema,
  TeacherPerformanceQuerySchema,
  TeacherStudentCardSchema,
} from './dashboards';
import { ChildInviteSchema } from './family';
import { CreateGroupBodySchema } from './groups';
import {
  TEACHER_WALLET_DEFAULT_PERIOD,
  TEACHER_WITHDRAW_MIN_KOPECKS,
  TeacherWalletQuerySchema,
  TeacherWalletSchema,
  TeacherWithdrawalSchema,
  TopUpWalletBodySchema,
  WALLET_TOPUP_MAX_KOPECKS,
  WALLET_TOPUP_MIN_KOPECKS,
  WithdrawTeacherWalletBodySchema,
} from './payments';
import { type RouteMeta } from './meta';
import { STREAMING_ROUTES } from './streaming';

/** Все роуты роутера (рекурсивно) с их ключом вида `auth.loginMax`. */
function collectRoutes(router: AppRouter, prefix = ''): Array<{ key: string; route: AppRoute }> {
  return Object.entries(router).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name;
    return isAppRoute(value) ? [{ key, route: value }] : collectRoutes(value, key);
  });
}

const routes = collectRoutes(apiContract);
const PUBLIC_PATH = /^\/(health(\/.*)?|auth\/(max|dev|register|login|refresh)|webhooks\/.*)$/;

describe('apiContract', () => {
  it('список роутов METHOD path стабилен', () => {
    const lines = routes.map(({ route }) => `${route.method} ${route.path}`);
    expect(lines).toMatchInlineSnapshot(`
      [
        "GET /health",
        "GET /health/live",
        "POST /auth/max",
        "POST /auth/dev",
        "POST /auth/register",
        "POST /auth/login",
        "POST /auth/refresh",
        "POST /auth/roles",
        "POST /auth/switch-role",
        "POST /auth/logout",
        "GET /me",
        "PATCH /me/settings",
        "PUT /me/avatar",
        "PATCH /me/teacher",
        "POST /student/link-code/rotate",
        "GET /student/home",
        "GET /student/profile",
        "GET /parent/children/:studentId/home",
        "GET /parent/children/:studentId/analytics",
        "GET /parent/children/:studentId/homework-progress",
        "GET /parent/children/:studentId/groups/:groupId/tasks",
        "GET /teacher/home",
        "GET /teacher/groups",
        "GET /teacher/groups/:groupId",
        "GET /teacher/students/:studentId",
        "GET /teacher/students/:studentId/groups/:groupId/tasks",
        "GET /teacher/performance",
        "GET /catalog/clubs",
        "GET /catalog/clubs/:clubId",
        "GET /teachers/:teacherId",
        "GET /student/calendar",
        "GET /parent/children/:studentId/calendar",
        "GET /teacher/calendar",
        "GET /teacher/groups/:groupId/lessons",
        "POST /teacher/groups/:groupId/lessons",
        "POST /teacher/groups",
        "GET /teacher/groups/:groupId/invite",
        "POST /teacher/groups/:groupId/invite/reset",
        "GET /student/group-invites/:token",
        "POST /student/group-invites/:token/join",
        "PATCH /teacher/lessons/:lessonId",
        "PATCH /teacher/groups/:groupId",
        "GET /teacher/groups/:groupId/candidates",
        "POST /teacher/groups/:groupId/students",
        "DELETE /teacher/groups/:groupId/students/:studentId",
        "GET /teacher/lessons/:lessonId/attendance",
        "PUT /teacher/lessons/:lessonId/attendance",
        "GET /student/courses",
        "GET /student/courses/:courseId",
        "GET /student/blocks/:blockId",
        "POST /student/blocks/:blockId/open",
        "POST /student/blocks/:blockId/complete",
        "GET /teacher/courses",
        "POST /teacher/courses",
        "GET /teacher/courses/:courseId",
        "PUT /teacher/courses/:courseId/structure",
        "PATCH /teacher/blocks/:blockId",
        "POST /teacher/courses/:courseId/publish",
        "POST /teacher/courses/:courseId/archive",
        "GET /teacher/courses/:courseId/progress",
        "GET /student/assignments",
        "GET /student/assignments/:assignmentId",
        "GET /student/homework",
        "POST /student/assignments/:assignmentId/submit",
        "GET /teacher/assignments",
        "POST /teacher/assignments",
        "PATCH /teacher/assignments/:assignmentId",
        "DELETE /teacher/assignments/:assignmentId",
        "GET /teacher/assignments/:assignmentId/submissions",
        "GET /teacher/submissions/:submissionId",
        "POST /teacher/submissions/:submissionId/grade",
        "POST /student/onboarding/start",
        "GET /student/onboarding/recommendations",
        "POST /student/onboarding/complete",
        "GET /teacher/clubs/demand",
        "GET /ai/conversations",
        "POST /ai/conversations",
        "GET /ai/conversations/:conversationId/messages",
        "DELETE /ai/conversations/:conversationId",
        "GET /parent/children/:studentId/ai/conversations",
        "POST /parent/children/:studentId/ai/conversations",
        "GET /parent/ai/conversations/:conversationId/messages",
        "GET /student/trajectory",
        "POST /student/trajectory/refresh",
        "GET /parent/children",
        "POST /parent/children/link",
        "POST /parent/children/invites",
        "DELETE /parent/children/:studentId",
        "GET /parent/children/:studentId/clubs",
        "GET /student/parent-invites/:token",
        "POST /student/parent-invites/:token/accept",
        "GET /parent/children/:studentId/payments",
        "POST /parent/children/:studentId/payments",
        "GET /parent/payments/:paymentId",
        "GET /parent/wallet",
        "POST /parent/wallet/top-up",
        "GET /teacher/wallet",
        "POST /teacher/wallet/withdraw",
        "POST /webhooks/payments/:provider",
        "POST /files/upload-url",
        "POST /files/:fileId/confirm",
        "GET /files/:fileId",
        "POST /teacher/course-builder/jobs",
        "GET /teacher/course-builder/jobs",
        "GET /teacher/course-builder/jobs/:jobId",
        "PUT /teacher/course-builder/jobs/:jobId/draft",
        "POST /teacher/course-builder/jobs/:jobId/accept",
        "POST /teacher/course-builder/jobs/:jobId/cancel",
        "GET /notifications",
        "POST /notifications/read",
        "GET /me/notification-settings",
        "PUT /me/notification-settings",
        "POST /support/tickets",
        "GET /support/tickets",
      ]
    `);
  });

  it('нет дублей method+path', () => {
    const seen = new Map<string, string>();
    for (const { key, route } of routes) {
      const id = `${route.method} ${route.path}`;
      expect(seen.get(id), `${key} дублирует ${seen.get(id)}`).toBeUndefined();
      seen.set(id, key);
    }
  });

  it('у каждого роута есть summary и metadata.auth', () => {
    for (const { key, route } of routes) {
      expect(route.summary, key).toBeTruthy();
      const meta = route.metadata as RouteMeta | undefined;
      expect(meta?.auth, key).toMatch(/^(public|user)$/);
    }
  });

  it('пути начинаются с / и не содержат префикс API', () => {
    for (const { key, route } of routes) {
      expect(route.path, key).toMatch(/^\//);
      expect(route.path, key).not.toContain(API_PREFIX);
    }
    expect(API_PREFIX).toBe('/api/v1');
  });

  it('публичные роуты — только health, auth/max|dev|register|login|refresh и webhooks', () => {
    for (const { key, route } of routes) {
      const meta = route.metadata as RouteMeta;
      if (meta.auth === 'public') {
        expect(route.path, key).toMatch(PUBLIC_PATH);
      } else {
        expect(route.path, key).not.toMatch(PUBLIC_PATH);
      }
    }
  });

  it('у роутов с permission роли заполнены из permissions.ts', () => {
    for (const { key, route } of routes) {
      const meta = route.metadata as RouteMeta;
      if (meta.permission) {
        expect(meta.roles?.length, key).toBeGreaterThan(0);
      }
    }
  });

  it('meta согласована с permissions.ts: каждая роль из roles имеет permission роута', () => {
    for (const { key, route } of routes) {
      const meta = route.metadata as RouteMeta;
      if (!meta.permission) continue;
      for (const role of meta.roles ?? []) {
        expect(hasPermission(role, meta.permission), `${key}: ${role}`).toBe(true);
      }
    }
  });

  it('Idempotency-Key обязателен у сдачи задания, платежа, пополнения и вывода', () => {
    const idempotent = [
      apiContract.assignments.submitAssignment,
      apiContract.payments.createPayment,
      apiContract.payments.topUpWallet,
      apiContract.payments.withdrawTeacherWallet,
    ];
    for (const route of idempotent) {
      const headers = route.headers as { safeParse: (v: unknown) => { success: boolean } };
      expect(headers.safeParse({}).success, route.path).toBe(false);
      expect(headers.safeParse({ 'idempotency-key': 'k1' }).success, route.path).toBe(true);
    }
  });

  it('commonResponses и strictStatusCodes применены к каждому роуту', () => {
    for (const { key, route } of routes) {
      expect(route.strictStatusCodes, key).toBe(true);
      expect(route.responses[401], key).toBeDefined();
      expect(route.responses[500], key).toBeDefined();
    }
  });

  it('стриминговые ручки не входят в ts-rest роутер', () => {
    const paths = new Set(routes.map(({ route }) => route.path));
    expect(paths.has(STREAMING_ROUTES.onboardingMessage.path)).toBe(false);
    expect(STREAMING_ROUTES.tutorMessage.path('abc')).toBe('/ai/conversations/abc/messages');
    expect(STREAMING_ROUTES.parentTutorMessage.path('abc')).toBe(
      '/parent/ai/conversations/abc/messages',
    );
    expect(STREAMING_ROUTES.parentTutorMessage.metadata.roles).toEqual(['PARENT']);
  });

  it('кошелёк преподавателя — только у TEACHER, вывод с Idempotency-Key', () => {
    const { getTeacherWallet, withdrawTeacherWallet } = apiContract.payments;
    expect((getTeacherWallet.metadata as RouteMeta).roles).toEqual(['TEACHER']);
    expect((withdrawTeacherWallet.metadata as RouteMeta).roles).toEqual(['TEACHER']);
    expect(withdrawTeacherWallet.headers).toBeDefined();
    expect(hasPermission('TEACHER', 'teacher:wallet.view')).toBe(true);
    expect(hasPermission('TEACHER', 'teacher:wallet.withdraw')).toBe(true);
    expect(hasPermission('PARENT', 'teacher:wallet.view')).toBe(false);
    expect(hasPermission('STUDENT', 'teacher:wallet.withdraw')).toBe(false);
  });

  it('совместим с ts-rest клиентом (тип AppRouter)', () => {
    expectTypeOf(apiContract).toMatchTypeOf<AppRouter>();
    const client = initClient(apiContract, { baseUrl: API_PREFIX, baseHeaders: {} });
    expectTypeOf(client.auth.getMe).toBeFunction();
    expectTypeOf<ApiContract['auth']['loginMax']['responses']>().toHaveProperty(401);
  });
});

describe('sanity-парсинг схем', () => {
  const id = '00000000-0000-7000-8000-000000000001';
  const me: MeDto = {
    user: { id, firstName: 'Алексей', lastName: null, nickname: null, avatarUrl: null },
    roles: ['STUDENT'],
    activeRole: 'STUDENT',
    needsRoleSetup: false,
    settings: { theme: 'SYSTEM', locale: 'ru' },
    student: {
      id,
      onboardingCompleted: true,
      schoolId: null,
      linkCode: 'ABC123',
      classLabel: '7Б',
    },
    parent: null,
    teacher: null,
  };

  it('AuthResultSchema', () => {
    expect(AuthResultSchema.safeParse({ accessToken: 'a', refreshToken: 'r', me }).success).toBe(
      true,
    );
    expect(AuthResultSchema.safeParse({ accessToken: '', refreshToken: 'r', me }).success).toBe(
      false,
    );
  });

  it('StudentHomeDtoSchema', () => {
    const home = {
      today: [],
      upcoming: [],
      tasks: [],
      stats: {
        attendanceRate: null,
        completionRate: 0.5,
        activityScore: 42,
        absences: 0,
        lateCount: 1,
        period: { from: '2026-08-22', to: '2026-09-21' },
      },
      clubs: [],
      aiComment: null,
    };
    expect(StudentHomeDtoSchema.safeParse(home).success).toBe(true);
    expect(
      StudentHomeDtoSchema.safeParse({ ...home, stats: { ...home.stats, activityScore: 101 } })
        .success,
    ).toBe(false);
  });

  it('HomeworkProgressQuerySchema: строка из query → 1|7|30, по умолчанию 7', () => {
    expect(HomeworkProgressQuerySchema.parse({})).toEqual({ days: 7 });
    expect(HomeworkProgressQuerySchema.parse({ days: '30' })).toEqual({ days: 30 });
    expect(HomeworkProgressQuerySchema.parse({ days: 1 })).toEqual({ days: 1 });
    expect(HomeworkProgressQuerySchema.safeParse({ days: '14' }).success).toBe(false);
    expect(HomeworkProgressQuerySchema.safeParse({ days: 'abc' }).success).toBe(false);
  });

  it('ChildAnalyticsDtoSchema: новые поля опциональны', () => {
    const analytics = {
      stats: {
        attendanceRate: 0.8,
        completionRate: null,
        activityScore: 10,
        absences: 1,
        lateCount: 0,
        period: { from: '2026-08-22', to: '2026-09-21' },
      },
      clubs: [],
      weekly: [],
      recentResults: [],
      attendanceHistory: [],
      aiSummary: null,
    };
    expect(ChildAnalyticsDtoSchema.safeParse(analytics).success).toBe(true);
    expect(
      ChildAnalyticsDtoSchema.safeParse({
        ...analytics,
        homework: { correct: 25, wrong: 30, upcoming: 45 },
        clubHomework: [],
        week: [{ date: '2026-09-21', status: 'TODAY' }],
      }).success,
    ).toBe(true);
  });

  it('StudentProfileDtoSchema: «Успеваемость» (week, homework, clubHomework) опциональна', () => {
    const profile = {
      user: me.user,
      classLabel: '7Б',
      school: null,
      clubs: [],
      stats: {
        attendanceRate: null,
        completionRate: null,
        activityScore: 0,
        absences: 0,
        lateCount: 0,
        period: { from: '2026-08-22', to: '2026-09-21' },
      },
      interests: [],
      goals: [],
    };
    expect(StudentProfileDtoSchema.safeParse(profile).success).toBe(true);
    expect(
      StudentProfileDtoSchema.safeParse({
        ...profile,
        week: [{ date: '2026-09-21', status: 'TODAY' }],
        homework: { correct: 1, wrong: 0, upcoming: 2 },
        clubHomework: [],
      }).success,
    ).toBe(true);
    expect(
      StudentProfileDtoSchema.safeParse({
        ...profile,
        homework: { correct: -1, wrong: 0, upcoming: 0 },
      }).success,
    ).toBe(false);
  });

  it('HomeworkTaskDetailSchema', () => {
    const task = {
      assignmentId: id,
      number: 1,
      title: 'Датчик расстояния',
      status: 'FAILED',
      dueAt: '2026-09-20T10:00:00.000Z',
      scorePercent: 20,
      statement: 'Подставьте функцию вместо __________',
      code: { language: 'python', source: 'print(1)' },
      answer: 'stop()',
      correctAnswer: 'readDistance()',
      score: 2,
      maxScore: 10,
    };
    expect(HomeworkTaskDetailSchema.safeParse(task).success).toBe(true);
    expect(HomeworkTaskDetailSchema.safeParse({ ...task, number: 0 }).success).toBe(false);
    expect(HomeworkTaskDetailSchema.safeParse({ ...task, status: 'OVERDUE' }).success).toBe(false);
  });

  it('ChildInviteSchema и TopUpWalletBodySchema', () => {
    expect(
      ChildInviteSchema.safeParse({
        token: 'a'.repeat(16),
        url: 'http://localhost/invite/aaaaaaaaaaaaaaaa',
        expiresAt: '2026-09-28T10:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      TopUpWalletBodySchema.safeParse({ amountKopecks: WALLET_TOPUP_MIN_KOPECKS }).success,
    ).toBe(true);
    expect(
      TopUpWalletBodySchema.safeParse({ amountKopecks: WALLET_TOPUP_MIN_KOPECKS - 1 }).success,
    ).toBe(false);
    expect(
      TopUpWalletBodySchema.safeParse({ amountKopecks: WALLET_TOPUP_MAX_KOPECKS + 1 }).success,
    ).toBe(false);
  });

  // ---------- Режим репетитора ----------

  const group = {
    id,
    title: 'Робототехника, группа А',
    club: { id, title: 'Робототехника', category: 'ROBOTICS', coverUrl: null },
    teacher: { id, user: me.user, photoUrl: null },
  };
  const student = { id, user: me.user, classLabel: '7Б' };
  const rub = (amountKopecks: number) => ({ amountKopecks, currency: 'RUB' as const });

  it('GroupBriefSchema: code опционален, nullable, 1..16 символов', () => {
    expect(GroupBriefSchema.safeParse(group).success).toBe(true);
    expect(GroupBriefSchema.safeParse({ ...group, code: null }).success).toBe(true);
    expect(GroupBriefSchema.parse({ ...group, code: '001' }).code).toBe('001');
    expect(GroupBriefSchema.safeParse({ ...group, code: '' }).success).toBe(false);
    expect(GroupBriefSchema.safeParse({ ...group, code: 'x'.repeat(17) }).success).toBe(false);
  });

  it('CreateGroupBodySchema: кружок из списка, конец занятия позже начала, расписание по умолчанию пустое', () => {
    const body = { category: 'CHINESE', title: ' Китайский, 5 класс ', price: rub(0) };
    const parsed = CreateGroupBodySchema.parse(body);
    expect(parsed.title).toBe('Китайский, 5 класс');
    expect(parsed.schedule).toEqual([]);
    expect(CreateGroupBodySchema.safeParse({ ...body, category: 'MATH' }).success).toBe(false);
    const rule = { weekday: 2, startTime: '17:00', endTime: '18:00' };
    expect(CreateGroupBodySchema.safeParse({ ...body, schedule: [rule] }).success).toBe(true);
    expect(
      CreateGroupBodySchema.safeParse({ ...body, schedule: [{ ...rule, endTime: '16:00' }] })
        .success,
    ).toBe(false);
  });

  it('UpdateTeacherProfileBodySchema: хотя бы одно поле, кружков — не меньше одного', () => {
    expect(UpdateTeacherProfileBodySchema.safeParse({ subjects: ['ART', 'CHESS'] }).success).toBe(
      true,
    );
    expect(UpdateTeacherProfileBodySchema.safeParse({ qualification: null }).success).toBe(true);
    expect(UpdateTeacherProfileBodySchema.safeParse({ subjects: [] }).success).toBe(false);
    expect(UpdateTeacherProfileBodySchema.safeParse({}).success).toBe(false);
  });

  it('TeacherStudentCardSchema: «Успеваемость» (week, homework, clubHomework) опциональна', () => {
    const card = {
      student,
      groups: [group],
      stats: {
        attendanceRate: 0.9,
        completionRate: 0.4,
        activityScore: 50,
        absences: 1,
        lateCount: 0,
        period: { from: '2026-08-22', to: '2026-09-21' },
      },
      clubs: [],
      weekly: [],
      history: [],
      attendanceHistory: [],
      aiSummary: null,
      needsAttention: [],
    };
    expect(TeacherStudentCardSchema.safeParse(card).success).toBe(true);
    expect(
      TeacherStudentCardSchema.safeParse({
        ...card,
        week: [{ date: '2026-09-21', status: 'ATTENDED' }],
        homework: { correct: 18, wrong: 20, upcoming: 7 },
        clubHomework: [
          {
            club: group.club,
            group: { ...group, code: '001' },
            counts: { correct: 1, wrong: 0, upcoming: 1 },
            tasks: [
              {
                assignmentId: id,
                number: 1,
                title: 'Задание 1',
                status: 'DONE',
                dueAt: null,
                scorePercent: 90,
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      TeacherStudentCardSchema.safeParse({
        ...card,
        week: [{ date: '21.09.2026', status: 'TODAY' }],
      }).success,
    ).toBe(false);
  });

  it('TeacherPerformanceQuerySchema: day|week|month|course, по умолчанию day', () => {
    expect(TeacherPerformanceQuerySchema.parse({})).toEqual({
      period: TEACHER_PERFORMANCE_DEFAULT_PERIOD,
    });
    expect(TEACHER_PERFORMANCE_DEFAULT_PERIOD).toBe('day');
    expect(TeacherPerformanceQuerySchema.parse({ period: 'course' })).toEqual({ period: 'course' });
    expect(TeacherPerformanceQuerySchema.safeParse({ period: 'year' }).success).toBe(false);
    expect(TeacherPerformanceQuerySchema.safeParse({ period: '7' }).success).toBe(false);
  });

  it('TeacherPerformanceDtoSchema: счётчики неотрицательны, правильно ≤ выполнено', () => {
    const row = {
      group: { ...group, code: '001' },
      studentsCount: 2,
      attended: 18,
      missed: 2,
      homeworkDone: 20,
      homeworkCorrect: 18,
    };
    const dto = {
      period: 'week',
      from: '2026-09-16T21:00:00.000Z',
      to: '2026-09-23T10:00:00.000Z',
      groups: [row],
    };
    expect(TeacherPerformanceDtoSchema.safeParse(dto).success).toBe(true);
    expect(TeacherPerformanceDtoSchema.safeParse({ ...dto, groups: [] }).success).toBe(true);
    expect(
      TeacherPerformanceDtoSchema.safeParse({ ...dto, groups: [{ ...row, missed: -1 }] }).success,
    ).toBe(false);
    expect(
      TeacherPerformanceDtoSchema.safeParse({ ...dto, groups: [{ ...row, homeworkCorrect: 21 }] })
        .success,
    ).toBe(false);
    expect(TeacherPerformanceDtoSchema.safeParse({ ...dto, period: 'year' }).success).toBe(false);
  });

  it('TeacherWalletQuerySchema: day|week|month, по умолчанию day', () => {
    expect(TeacherWalletQuerySchema.parse({})).toEqual({ period: TEACHER_WALLET_DEFAULT_PERIOD });
    expect(TEACHER_WALLET_DEFAULT_PERIOD).toBe('day');
    expect(TeacherWalletQuerySchema.parse({ period: 'month' })).toEqual({ period: 'month' });
    expect(TeacherWalletQuerySchema.safeParse({ period: 'course' }).success).toBe(false);
  });

  it('TeacherWalletSchema: поступления, вывод без группы и ученика, «Вам должны»', () => {
    const income = {
      id,
      kind: 'INCOME',
      amount: rub(3000_00),
      at: '2026-09-23T07:00:00.000Z',
      group,
      student,
    };
    const withdrawal = {
      id,
      kind: 'WITHDRAWAL',
      amount: rub(12_388_00),
      at: '2026-09-22T16:00:00.000Z',
      group: null,
      student: null,
    };
    const wallet = {
      balance: rub(6700_00),
      period: 'day',
      from: '2026-09-22T21:00:00.000Z',
      to: '2026-09-23T10:00:00.000Z',
      history: [
        { at: '2026-09-22T21:00:00.000Z', balance: rub(3700_00) },
        { at: '2026-09-23T10:00:00.000Z', balance: rub(6700_00) },
      ],
      transactions: [income, withdrawal],
      debts: [{ id, group, student, amount: rub(3500_00), dueAt: '2026-10-24' }],
    };
    expect(TeacherWalletSchema.safeParse(wallet).success).toBe(true);
    expect(
      TeacherWalletSchema.safeParse({ ...wallet, history: [], transactions: [], debts: [] })
        .success,
    ).toBe(true);
    expect(
      TeacherWalletSchema.safeParse({ ...wallet, transactions: [{ ...income, amount: rub(0) }] })
        .success,
    ).toBe(false);
    expect(
      TeacherWalletSchema.safeParse({ ...wallet, transactions: [{ ...income, kind: 'REFUND' }] })
        .success,
    ).toBe(false);
    expect(
      TeacherWalletSchema.safeParse({
        ...wallet,
        debts: [{ id, group, student, amount: rub(3500_00), dueAt: '2026-10-24T00:00:00.000Z' }],
      }).success,
    ).toBe(false);
    expect(
      TeacherWithdrawalSchema.safeParse({ balance: rub(0), transaction: withdrawal }).success,
    ).toBe(true);
  });

  it('WithdrawTeacherWalletBodySchema: не меньше минимума, целые копейки', () => {
    expect(
      WithdrawTeacherWalletBodySchema.safeParse({ amountKopecks: TEACHER_WITHDRAW_MIN_KOPECKS })
        .success,
    ).toBe(true);
    expect(
      WithdrawTeacherWalletBodySchema.safeParse({ amountKopecks: TEACHER_WITHDRAW_MIN_KOPECKS - 1 })
        .success,
    ).toBe(false);
    expect(
      WithdrawTeacherWalletBodySchema.safeParse({
        amountKopecks: TEACHER_WITHDRAW_MIN_KOPECKS + 0.5,
      }).success,
    ).toBe(false);
  });
});
