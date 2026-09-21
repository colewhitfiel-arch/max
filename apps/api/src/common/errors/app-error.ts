import { ERROR_HTTP_STATUS, type ErrorCode } from '@edu/contracts';

/**
 * Прикладная ошибка с кодом из контракта. Фильтр превращает её в `{ error: { code, message, details } }`
 * с HTTP-статусом по ERROR_HTTP_STATUS. Бросай через фабрики `Errors.*`.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
  }
}

export const Errors = {
  validation: (message = 'Некорректные данные', details?: unknown) =>
    new AppError('VALIDATION', message, details),
  unauthorized: (message = 'Требуется вход') => new AppError('UNAUTHORIZED', message),
  forbidden: (message = 'Недостаточно прав') => new AppError('FORBIDDEN', message),
  notFound: (entity = 'Объект', details?: unknown) =>
    new AppError('NOT_FOUND', `${entity} не найден`, details),
  conflict: (message = 'Конфликт данных', details?: unknown) =>
    new AppError('CONFLICT', message, details),
  businessRule: (message: string, details?: unknown) =>
    new AppError('BUSINESS_RULE', message, details),
  rateLimited: (message = 'Слишком много запросов') => new AppError('RATE_LIMITED', message),
  notImplemented: (what = 'Функция') =>
    new AppError('NOT_IMPLEMENTED', `${what} пока не реализована`),
  external: (service: string, cause?: unknown) =>
    new AppError('EXTERNAL_INTEGRATION', `Ошибка внешнего сервиса: ${service}`, undefined, {
      cause,
    }),
  internal: (message = 'Внутренняя ошибка', cause?: unknown) =>
    new AppError('INTERNAL', message, undefined, { cause }),
};
