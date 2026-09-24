/**
 * Единый ts-rest клиент (ADR-013). Кастомный fetcher подставляет Authorization и X-Request-Id,
 * по 401 один раз обновляет пару токенов через `authContract.refresh` и повторяет запрос.
 * Отказ refresh (4xx) разлогинивает; сетевой сбой/5xx refresh — нет (сессия может быть жива).
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
import { type ApiClientError, apiErrorFromException, apiErrorFromResponse } from './errors';

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

export interface RawResponse {
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

/**
 * Итог обновления токенов: `unauthorized` — сервер отверг refresh (сессия невалидна);
 * `failed` — сеть/5xx/429: сессия, возможно, жива, разлогинивать нельзя.
 */
export type RefreshOutcome =
  | { kind: 'ok'; tokens: TokenPair }
  | { kind: 'unauthorized' }
  | { kind: 'failed'; error: ApiClientError; response?: RawResponse };

type RefreshFailure = Extract<RefreshOutcome, { kind: 'failed' }>;

/** 4xx на refresh — токен отвергнут; 408/429 и 5xx — временный сбой. */
const isRefreshRejected = (status: number) =>
  status >= 400 && status < 500 && status !== 408 && status !== 429;

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** Обновляет пару токенов; параллельные 401 ждут один и тот же refresh. */
export function refreshTokens(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    const refreshToken = authAdapter?.getRefreshToken();
    if (!refreshToken || !authAdapter) return { kind: 'unauthorized' };
    try {
      const result = await refreshClient.refresh({ body: { refreshToken } });
      if (result.status === 200) {
        const tokens = TokenPairSchema.parse(result.body);
        authAdapter.onTokensRefreshed(tokens);
        return { kind: 'ok', tokens };
      }
      if (isRefreshRejected(result.status)) return { kind: 'unauthorized' };
      return {
        kind: 'failed',
        error: apiErrorFromResponse(result.status, result.body),
        response: result,
      };
    } catch (cause) {
      return { kind: 'failed', error: apiErrorFromException(cause) };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Сообщить store, что сессия невалидна (для запросов вне ts-rest). */
export function notifyUnauthorized(): void {
  authAdapter?.onUnauthorized();
}

/**
 * Запрос с авторизацией: по 401 один раз обновляет токены и повторяет `attempt`.
 * Отказ refresh → `onUnauthorized` и первый ответ; сбой refresh (сеть/5xx) → `onRefreshFailed`
 * без разлогина.
 */
async function withAuthRetry<T extends { status: number }>(
  attempt: (token: string | null) => Promise<T>,
  onRefreshFailed: (failure: RefreshFailure) => T,
  canRefresh = true,
): Promise<T> {
  const first = await attempt(authAdapter?.getAccessToken() ?? null);
  if (first.status !== 401 || !canRefresh || !authAdapter?.getRefreshToken()) return first;
  const outcome = await refreshTokens();
  if (outcome.kind === 'unauthorized') {
    notifyUnauthorized();
    return first;
  }
  if (outcome.kind === 'failed') return onRefreshFailed(outcome);
  const second = await attempt(outcome.tokens.accessToken);
  if (second.status === 401) notifyUnauthorized();
  return second;
}

/**
 * `fetch` вне ts-rest (SSE) с той же логикой 401 → refresh → повтор. `attempt` получает
 * access-токен для заголовка Authorization. Сбой refresh бросает `ApiClientError`.
 */
export function fetchWithAuthRetry(
  attempt: (token: string | null) => Promise<Response>,
): Promise<Response> {
  return withAuthRetry(attempt, (failure) => {
    throw failure.error;
  });
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
    return await withAuthRetry(
      attempt,
      // 5xx refresh — отдаём его ответ (TanStack ретраит), сеть — бросаем EXTERNAL_INTEGRATION.
      (failure) => {
        if (failure.response) return failure.response;
        throw failure.error;
      },
      !isRefreshRoute(args),
    );
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
 * 404 без тела ApiError → NOT_IMPLEMENTED, «раздел в разработке», и т.д.).
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
