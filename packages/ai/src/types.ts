/**
 * Базовые типы слоя ИИ.
 *
 * Пакет не знает о домене и о конкретном провайдере: feature-модули работают
 * только с этими типами и интерфейсом `AiProvider` (см. `provider.ts`).
 */

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiRole;
  content: string;
}

export type AiResponseFormat = 'text' | 'json';

/** Служебные метки запроса: попадают в логи и метрики, но не в модель. */
export interface AiRequestMetadata {
  /** Ключ промпта из реестра (`id@version`). */
  promptId?: string;
  userId?: string;
  /** Проставляется `AiService`, если не задан вызывающим. */
  requestId?: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Подсказка провайдеру, что ожидается JSON. Разбор и валидация — в `json.ts`. */
  responseFormat?: AiResponseFormat;
  signal?: AbortSignal;
  metadata?: AiRequestMetadata;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiChatResponse {
  content: string;
  model: string;
  usage?: AiUsage;
  finishReason?: string;
  /** Сырой ответ провайдера — только для отладки, в логи не пишется. */
  raw?: unknown;
}

export type AiStreamChunk =
  | { type: 'token'; text: string }
  | { type: 'done'; response: AiChatResponse }
  | { type: 'error'; error: AiProviderError };

export interface AiEmbedRequest {
  input: string[];
  model?: string;
  signal?: AbortSignal;
  metadata?: AiRequestMetadata;
}

export interface AiEmbedResponse {
  vectors: number[][];
  model: string;
  usage?: AiUsage;
}

export type AiErrorCode =
  'TIMEOUT' | 'RATE_LIMITED' | 'AUTH' | 'INVALID_RESPONSE' | 'NETWORK' | 'UNAVAILABLE' | 'UNKNOWN';

/** Коды, при которых повтор запроса имеет смысл по умолчанию. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  'TIMEOUT',
  'RATE_LIMITED',
  'NETWORK',
  'UNAVAILABLE',
]);

export interface AiProviderErrorOptions {
  /** По умолчанию выводится из кода (см. `RETRYABLE_ERROR_CODES`). */
  retryable?: boolean;
  /** HTTP-статус, если ошибка пришла от API. */
  status?: number;
  cause?: unknown;
  /** Подсказка сервера (`Retry-After`), сколько ждать до повтора. */
  retryAfterMs?: number;
}

/**
 * Единственный тип ошибки, который провайдеры отдают наружу.
 * Сообщение не должно содержать ключей, токенов и текста запросов/ответов.
 */
export class AiProviderError extends Error {
  override readonly name = 'AiProviderError';
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(code: AiErrorCode, message: string, options: AiProviderErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE_ERROR_CODES.has(code);
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

/** Отмена через `AbortSignal` (DOMException `AbortError` в Node/undici). */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Приводит произвольную ошибку к `AiProviderError`.
 * `AiProviderError` возвращается как есть; всё остальное оборачивается с кодом `fallbackCode`.
 */
export function toAiProviderError(
  error: unknown,
  fallbackCode: AiErrorCode = 'UNKNOWN',
): AiProviderError {
  if (isAiProviderError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AiProviderError(fallbackCode, message, { cause: error });
}
