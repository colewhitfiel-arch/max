/**
 * Единый ts-rest клиент (ADR-013). Кастомный fetcher подставляет Authorization и X-Request-Id,
 * по 401 один раз обновляет пару токенов через `authContract.refresh` и повторяет запрос.
 * Токены живут в auth-store; клиент получает их через `ApiAuthAdapter`, чтобы не тянуть store
 * (и React) в транспортный слой.
 */
import {
  type ApiContract,
  apiContract,
  authContract,
  type TokenPair,
  TokenPairSchema,
} from '@edu/contracts';
import { type ApiFetcher, type ApiFetcherArgs, initClient } from '@ts-rest/core';
import { config } from '../config';
import { apiErrorFromException, apiErrorFromResponse } from './errors';

export interface ApiAuthAdapter {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  /** Новая пара после успешного refresh. */
  onTokensRefreshed(tokens: TokenPair): void;
  /** Refresh не удался — сессия невалидна. */
  onUnauthorized(): void;
}

let authAdapter: ApiAuthAdapter | null = null;

/** Регистрирует источник токенов (вызывает auth-store при инициализации). */
export function setApiAuthAdapter(adapter: ApiAuthAdapter | null): void {
  authAdapter = adapter;
}

export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Заголовки авторизации для запросов вне ts-rest (SSE). */
export function authHeaders(): Record<string, string> {
  const token = authAdapter?.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RawResponse {
  status: number;
  body: unknown;
  headers: Headers;
}

/** Низкоуровневый fetch: только транспорт и разбор тела, без auth-логики. */
async function rawFetch(args: ApiFetcherArgs, extraHeaders: Record<string, string>) {
  const response = await fetch(args.path, {
    ...args.fetchOptions,
    method: args.method,
    headers: { ...args.headers, ...extraHeaders },
    body: args.body,
    signal: args.fetchOptions?.signal ?? args.signal,
  });
  return { status: response.status, body: await parseBody(response), headers: response.headers };
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  if (contentType.startsWith('text/')) return response.text();
  // Пустое тело или бинарь — фронту не нужно.
  return undefined;
}

let refreshInFlight: Promise<TokenPair | null> | null = null;

/** Обновляет пару токенов; параллельные 401 ждут один и тот же refresh. */
function refreshTokens(): Promise<TokenPair | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = authAdapter?.getRefreshToken();
    if (!refreshToken || !authAdapter) return null;
    try {
      const result = await refreshClient.refresh({ body: { refreshToken } });
      if (result.status !== 200) return null;
      const tokens = TokenPairSchema.parse(result.body);
      authAdapter.onTokensRefreshed(tokens);
      return tokens;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

const isRefreshRoute = (args: ApiFetcherArgs) => args.route.path === authContract.refresh.path;

/** Fetcher ts-rest с авторизацией, request-id и повтором после refresh. */
export const customFetch: ApiFetcher = async (args): Promise<RawResponse> => {
  const attempt = (token: string | null) =>
    rawFetch(args, {
      'X-Request-Id': newRequestId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

  try {
    const first = await attempt(authAdapter?.getAccessToken() ?? null);
    if (first.status !== 401 || isRefreshRoute(args) || !authAdapter?.getRefreshToken()) {
      return first;
    }
    const tokens = await refreshTokens();
    if (!tokens) {
      authAdapter.onUnauthorized();
      return first;
    }
    const second = await attempt(tokens.accessToken);
    if (second.status === 401) authAdapter.onUnauthorized();
    return second;
  } catch (cause) {
    throw apiErrorFromException(cause);
  }
};

const clientArgs = {
  baseUrl: config.apiUrl,
  baseHeaders: { 'Content-Type': 'application/json' },
  api: customFetch,
} as const;

/** Клиент только для refresh — без Authorization и без повтора по 401. */
const refreshClient = initClient(
  { refresh: authContract.refresh },
  {
    baseUrl: config.apiUrl,
    baseHeaders: { 'Content-Type': 'application/json' },
    api: (args) => rawFetch(args, { 'X-Request-Id': newRequestId() }),
  },
);

/** Типизированный клиент всего контракта: `api.dashboards.getStudentHome()`. */
export const api = initClient<ApiContract, typeof clientArgs>(apiContract, clientArgs);

export type ApiClient = typeof api;

type SuccessStatus = 200 | 201 | 202 | 204;
type ClientResult = { status: number; body: unknown; headers: Headers };
export type Unwrapped<R extends ClientResult> = Extract<R, { status: SuccessStatus }>['body'];

/**
 * Возвращает body при 2xx, иначе бросает `ApiClientError` (тело ошибки — `ApiErrorSchema`;
 * 404 без тела → NOT_FOUND и т.д.).
 */
export function unwrap<R extends ClientResult>(result: R): Unwrapped<R> {
  if (result.status >= 200 && result.status < 300) return result.body as Unwrapped<R>;
  throw apiErrorFromResponse(
    result.status,
    result.body,
    result.headers?.get?.('x-request-id') ?? undefined,
  );
}

/** Сахар: `call(api.auth.getMe())` → body или ApiClientError. */
export async function call<R extends ClientResult>(promise: Promise<R>): Promise<Unwrapped<R>> {
  return unwrap(await promise);
}
