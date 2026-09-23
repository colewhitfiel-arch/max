/**
 * Утилиты MSW-хендлеров: адрес API, типизированный JSON-ответ (проверка схемой контракта),
 * единый формат ошибок, разбор Bearer-токена мока.
 */
import {
  type ApiError,
  type ErrorCode,
  ERROR_HTTP_STATUS,
  PeriodQuerySchema,
  type Role,
} from '@edu/contracts';
import {
  type DefaultBodyType,
  HttpResponse,
  type HttpResponseResolver,
  type PathParams,
} from 'msw';
import type { z } from 'zod';
import { config } from '../../config';
import { db, type MockUser, parentOfUser } from './state';

export const apiUrl = (path: string) => `${config.apiUrl}${path}`;

/** JSON-ответ, проверенный zod-схемой контракта: моки не расходятся с типами. */
export function json<S extends z.ZodTypeAny>(schema: S, data: z.input<S>, status = 200) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error('[msw] ответ не соответствует контракту', parsed.error.flatten());
    return apiError('INTERNAL', 'Мок вернул данные, не соответствующие контракту', {
      issues: parsed.error.issues,
    });
  }
  return HttpResponse.json(parsed.data as z.output<S>, { status });
}

export function apiError(code: ErrorCode, message: string, details?: unknown) {
  const body: ApiError = { error: { code, message, details, requestId: crypto.randomUUID() } };
  return HttpResponse.json(body, { status: ERROR_HTTP_STATUS[code] });
}

export const noContent = () => new HttpResponse(null, { status: 204 });

export interface AuthContext {
  user: MockUser;
  role: Role | null;
}

const TOKEN_PREFIX = { access: 'mock-access', refresh: 'mock-refresh' } as const;

export function issueTokens(userId: string, role: Role | null) {
  const nonce = Math.random().toString(36).slice(2, 10);
  return {
    accessToken: `${TOKEN_PREFIX.access}.${userId}.${role ?? '-'}.${nonce}`,
    refreshToken: `${TOKEN_PREFIX.refresh}.${userId}.${role ?? '-'}.${nonce}`,
  };
}

export function parseToken(
  token: string | null | undefined,
  kind: keyof typeof TOKEN_PREFIX,
): { userId: string; role: Role | null } | null {
  if (!token) return null;
  const [prefix, userId, role] = token.split('.');
  if (prefix !== TOKEN_PREFIX[kind] || !userId) return null;
  return { userId, role: role && role !== '-' ? (role as Role) : null };
}

export function resolveAuth(request: Request): AuthContext | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const parsed = parseToken(header.slice('Bearer '.length).trim(), 'access');
  if (!parsed) return null;
  const user = db.users.get(parsed.userId);
  if (!user) return null;
  return { user, role: parsed.role };
}

type AuthedResolver<P extends PathParams> = (ctx: {
  auth: AuthContext;
  request: Request;
  params: P;
}) => Response | Promise<Response>;

/** Оборачивает резолвер проверкой Bearer-токена (401) и, опционально, роли (403). */
export function authed<P extends PathParams = PathParams>(
  handler: AuthedResolver<P>,
  roles?: Role[],
): HttpResponseResolver<P, DefaultBodyType, undefined> {
  return async ({ request, params }) => {
    const auth = resolveAuth(request);
    if (!auth) return apiError('UNAUTHORIZED', 'Нужен Bearer-токен');
    if (roles && (!auth.role || !roles.includes(auth.role))) {
      return apiError('FORBIDDEN', 'Роль не имеет доступа к этому разделу');
    }
    return handler({ auth, request, params });
  };
}

/**
 * Политика связи родитель ↔ ребёнок: 403, если пользователь не родитель этого ученика
 * (нет `ParentStudentLink` в статусе ACTIVE); иначе null.
 */
export function denyForeignChild(userId: string, studentId: string): Response | null {
  const parent = parentOfUser(userId);
  const linked =
    !!parent &&
    db.links.some(
      (l) => l.parentId === parent.id && l.studentId === studentId && l.status === 'ACTIVE',
    );
  return linked ? null : apiError('FORBIDDEN', 'Ребёнок не привязан');
}

export async function readBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError('VALIDATION', 'Неверное тело запроса', parsed.error.flatten()),
    };
  }
  return { ok: true, data: parsed.data };
}

export const query = (request: Request) => new URL(request.url).searchParams;

/** `?from=&to=` по `PeriodQuerySchema` (YYYY-MM-DD); неверный формат — VALIDATION, а не пустой список. */
export function periodQuery(
  request: Request,
): { ok: true; data: z.output<typeof PeriodQuerySchema> } | { ok: false; response: Response } {
  const parsed = PeriodQuerySchema.safeParse(Object.fromEntries(query(request)));
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError('VALIDATION', 'Неверные параметры запроса', parsed.error.flatten()),
    };
  }
  return { ok: true, data: parsed.data };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
