import { AiProviderError } from '../../types';

/** `Retry-After` в секундах или HTTP-дате → миллисекунды ожидания. */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/** Достаёт `message` из JSON-тела ошибки API (без текста запросов), обрезая до 200 символов. */
function extractApiMessage(bodyText: string): string | undefined {
  if (!bodyText) return undefined;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const { message } = parsed as { message?: unknown };
      if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 200);
    }
  } catch {
    // тело не JSON — не включаем в сообщение
  }
  return undefined;
}

/** HTTP-статус → `AiProviderError` с кодом и признаком retryable. */
export function mapHttpError(
  status: number,
  bodyText: string,
  headers: Headers | undefined,
  op: string,
): AiProviderError {
  const detail = extractApiMessage(bodyText);
  const message = `GigaChat ${op}: HTTP ${status}${detail ? ` — ${detail}` : ''}`;

  if (status === 401 || status === 403) {
    return new AiProviderError('AUTH', message, { status, retryable: false });
  }
  if (status === 429) {
    return new AiProviderError('RATE_LIMITED', message, {
      status,
      retryAfterMs: parseRetryAfter(headers?.get('retry-after')),
    });
  }
  if (status === 408) return new AiProviderError('TIMEOUT', message, { status });
  if (status >= 500) return new AiProviderError('UNAVAILABLE', message, { status });
  return new AiProviderError('UNKNOWN', message, { status, retryable: false });
}

/**
 * Ошибка `fetch` (не HTTP-статус) → `AiProviderError`.
 * Отмену через `AbortSignal` сюда передавать не нужно — она пробрасывается как есть.
 */
export function mapFetchError(error: unknown, op: string): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof TypeError) {
    const cause = (error as { cause?: unknown }).cause;
    const code =
      cause && typeof cause === 'object' && 'code' in cause
        ? String((cause as { code?: unknown }).code)
        : undefined;
    return new AiProviderError(
      'NETWORK',
      `GigaChat ${op}: сетевая ошибка${code ? ` (${code})` : ''}`,
      { cause: error },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiProviderError('UNKNOWN', `GigaChat ${op}: ${message}`, {
    retryable: false,
    cause: error,
  });
}
