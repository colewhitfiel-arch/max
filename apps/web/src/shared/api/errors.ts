import { ApiErrorSchema, type ErrorCode } from '@edu/contracts';
import { i18n } from '../i18n';

/**
 * Единая ошибка API на фронте (ADR-013). Любой сбой — сетевой, парсинг, 4xx/5xx —
 * нормализуется клиентом в этот класс; фичи не знают о транспорте.
 */
export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiClientError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /**
   * Раздел ещё не реализован на сервере: 501 NOT_IMPLEMENTED (API, MSW-заглушка незамоканных
   * ручек) или голый 404 без тела ApiError (ручки нет за прокси). NOT_FOUND с телом ApiError —
   * это «объект не найден» (удалённое задание, неизвестный преподаватель), а не «в разработке».
   */
  get isNotImplemented(): boolean {
    return this.code === 'NOT_IMPLEMENTED';
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
  501: 'NOT_IMPLEMENTED',
  502: 'EXTERNAL_INTEGRATION',
  503: 'EXTERNAL_INTEGRATION',
  504: 'EXTERNAL_INTEGRATION',
};

/** Собирает ApiClientError из HTTP-статуса и тела (тело может быть не в формате ApiError). */
export function apiErrorFromResponse(
  status: number,
  body: unknown,
  requestId?: string,
): ApiClientError {
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { error } = parsed.data;
    return new ApiClientError({
      code: error.code,
      message: error.message,
      status,
      details: error.details,
      requestId: error.requestId ?? requestId,
    });
  }
  // 404 без тела ApiError — ответил не наш API (ручки нет за прокси): «раздел в разработке».
  const code =
    status === 404
      ? 'NOT_IMPLEMENTED'
      : (STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION'));
  return new ApiClientError({
    code,
    message: typeof body === 'string' && body ? body : `HTTP ${status}`,
    status,
    requestId,
  });
}

/** Ошибка сети/парсинга — сервер не ответил осмысленно. */
export function apiErrorFromException(cause: unknown): ApiClientError {
  if (isApiClientError(cause)) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  const isAbort = cause instanceof Error && cause.name === 'AbortError';
  return new ApiClientError({
    code: isAbort ? 'INTERNAL' : 'EXTERNAL_INTEGRATION',
    message: isAbort ? i18n.t('common:errors.aborted') : message || i18n.t('common:errors.network'),
    status: 0,
    details: cause,
  });
}

/** Текст по коду ошибки на текущем языке (`common:errors.codes.*`). */
function codeText(code: ErrorCode): string {
  return i18n.t(`common:errors.codes.${code}`);
}

/** Текст ошибки для пользователя (по коду). Для BUSINESS_RULE/VALIDATION — сообщение сервера. */
export function describeApiError(error: unknown): string {
  if (!isApiClientError(error)) {
    return error instanceof Error && error.message ? error.message : codeText('INTERNAL');
  }
  if ((error.code === 'BUSINESS_RULE' || error.code === 'VALIDATION') && error.message) {
    return error.message;
  }
  return codeText(error.code);
}
