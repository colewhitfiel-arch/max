import { type AppRoute, type AppRouter, initClient, isAppRoute } from '@ts-rest/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { API_PREFIX, type ApiContract, apiContract } from '../index';
import { AuthResultSchema, type MeDto } from './auth';
import { StudentHomeDtoSchema } from './dashboards';
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
const PUBLIC_PATH = /^\/(health(\/.*)?|auth\/(max|dev|refresh)|webhooks\/.*)$/;

describe('apiContract', () => {
  it('список роутов METHOD path стабилен', () => {
    const lines = routes.map(({ route }) => `${route.method} ${route.path}`);
    expect(lines).toMatchInlineSnapshot(`
      [
        "GET /health",
        "GET /health/live",
        "POST /auth/max",
        "POST /auth/dev",
        "POST /auth/refresh",
        "POST /auth/roles",
        "POST /auth/switch-role",
        "POST /auth/logout",
        "GET /me",
        "PATCH /me/settings",
        "POST /student/link-code/rotate",
        "GET /student/home",
        "GET /student/profile",
        "GET /parent/children/:studentId/home",
        "GET /parent/children/:studentId/analytics",
        "GET /teacher/home",
        "GET /teacher/groups",
        "GET /teacher/groups/:groupId",
        "GET /teacher/students/:studentId",
        "GET /catalog/clubs",
        "GET /catalog/clubs/:clubId",
        "GET /teachers/:teacherId",
        "GET /student/calendar",
        "GET /parent/children/:studentId/calendar",
        "GET /teacher/groups/:groupId/lessons",
        "POST /teacher/groups/:groupId/lessons",
        "PATCH /teacher/lessons/:lessonId",
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
        "GET /student/trajectory",
        "POST /student/trajectory/refresh",
        "GET /parent/children",
        "POST /parent/children/link",
        "DELETE /parent/children/:studentId",
        "GET /parent/children/:studentId/clubs",
        "GET /parent/children/:studentId/payments",
        "POST /parent/children/:studentId/payments",
        "GET /parent/payments/:paymentId",
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

  it('публичные роуты — только health, auth/max|dev|refresh и webhooks', () => {
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
});
