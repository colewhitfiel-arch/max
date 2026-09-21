/**
 * Единый формат ошибок API и коды. Успешный ответ — DTO без обёртки (2xx),
 * ошибка — `{ error: { code, message, details?, requestId? } }` с соответствующим HTTP-статусом.
 * Заголовок `X-Request-Id` присутствует во всех ответах.
 */
import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'BUSINESS_RULE',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
  'EXTERNAL_INTEGRATION',
  'INTERNAL',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
  EXTERNAL_INTEGRATION: 502,
  INTERNAL: 500,
};

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function isApiError(value: unknown): value is ApiError {
  return ApiErrorSchema.safeParse(value).success;
}

/** Набор ответов-ошибок, общий для всех роутов ts-rest (commonResponses). */
export const commonErrorResponses = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  422: ApiErrorSchema,
  429: ApiErrorSchema,
  500: ApiErrorSchema,
  501: ApiErrorSchema,
  502: ApiErrorSchema,
} as const;
