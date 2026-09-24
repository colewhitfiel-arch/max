import { sleep, throwIfAborted } from './abort';
import { isAbortError, isAiProviderError } from './types';

export interface RetryInfo {
  error: unknown;
  /** Номер неудачной попытки, начиная с 1. */
  attempt: number;
  /** Пауза перед следующей попыткой. */
  delayMs: number;
}

export interface RetryOptions {
  /** Сколько повторов после первой попытки. По умолчанию 2 (итого до 3 вызовов). */
  maxRetries?: number;
  /** Базовая задержка; растёт экспоненциально. По умолчанию 300 мс. */
  baseDelayMs?: number;
  /** Верхняя граница задержки. По умолчанию 5000 мс. */
  maxDelayMs?: number;
  /**
   * Нижняя граница задержки при `RATE_LIMITED` без `Retry-After` (растёт как `base * 2^attempt`).
   * Лимиты провайдера обычно посекундные, короткий джиттер их не переживает.
   */
  rateLimitDelayMs?: number;
  /**
   * По умолчанию — `AiProviderError.retryable`; отмена никогда не повторяется.
   * `attempt` — индекс неудачной попытки с 0 (в отличие от `RetryInfo.attempt`, который с 1).
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: RetryInfo) => void;
  signal?: AbortSignal;
  /** Источник случайности для джиттера (подменяется в тестах). */
  random?: () => number;
  /** Функция ожидания (подменяется в тестах). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 2,
  baseDelayMs: 300,
  maxDelayMs: 5000,
} as const;

/** Повторяем только ошибки провайдера, помеченные как `retryable`. Отмену — никогда. */
export function defaultShouldRetry(error: unknown): boolean {
  if (isAbortError(error)) return false;
  return isAiProviderError(error) && error.retryable;
}

export interface BackoffParams {
  baseDelayMs: number;
  maxDelayMs: number;
  random?: () => number;
  /** Подсказка сервера (`Retry-After`), если есть. */
  retryAfterMs?: number;
}

/**
 * Экспоненциальная задержка с джиттером: `base * 2^attempt`, умноженная на случайный
 * коэффициент из [0.5, 1]. Подсказка `retryAfterMs` поднимает задержку до себя, но итог всегда
 * не больше `maxDelayMs` (серверный `Retry-After` больше `maxDelayMs` `withRetry` не ретраит).
 */
export function computeBackoff(attempt: number, params: BackoffParams): number {
  const random = params.random ?? Math.random;
  const exponential = Math.min(params.maxDelayMs, params.baseDelayMs * 2 ** attempt);
  const jittered = exponential * (0.5 + random() * 0.5);
  const withHint =
    params.retryAfterMs !== undefined ? Math.max(jittered, params.retryAfterMs) : jittered;
  return Math.round(Math.min(params.maxDelayMs, withHint));
}

/**
 * Выполняет `fn`, повторяя при ошибках, для которых `shouldRetry` вернул `true`.
 * `fn` получает номер попытки (с 0). Последняя ошибка пробрасывается как есть.
 * Если сервер просит подождать (`Retry-After`) дольше `maxDelayMs`, повтора нет: ошибка сразу уходит
 * вызывающему со своим `retryAfterMs` — иначе повтор пришёл бы раньше срока и снова получил 429.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const wait = options.sleep ?? sleep;
  const { signal } = options;

  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= maxRetries || signal?.aborted || !shouldRetry(error, attempt)) throw error;
      if (isAiProviderError(error) && (error.retryAfterMs ?? 0) > maxDelayMs) throw error;
      const delayMs = computeBackoff(attempt, {
        baseDelayMs,
        maxDelayMs,
        random: options.random,
        retryAfterMs: rateLimitHint(error, attempt, options.rateLimitDelayMs),
      });
      options.onRetry?.({ error, attempt: attempt + 1, delayMs });
      await wait(delayMs, signal);
    }
  }
}

/** `Retry-After` провайдера, а без него для RATE_LIMITED — экспоненциальный минимум от `rateLimitDelayMs`. */
function rateLimitHint(
  error: unknown,
  attempt: number,
  rateLimitDelayMs: number | undefined,
): number | undefined {
  if (!isAiProviderError(error)) return undefined;
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  if (error.code === 'RATE_LIMITED' && rateLimitDelayMs) return rateLimitDelayMs * 2 ** attempt;
  return undefined;
}
