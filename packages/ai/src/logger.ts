import type { AiChatRequest, AiChatResponse, AiEmbedRequest } from './types';
import { isAiProviderError } from './types';

export type AiLogMeta = Record<string, unknown>;

/**
 * Минимальный интерфейс логгера, совместимый с pino/console.
 *
 * ПРАВИЛО: в логи не попадают ключи, токены и содержимое сообщений — только размеры
 * (символы/токены), идентификаторы (promptId, requestId, userId), модель, длительность и код ошибки.
 * Используй `describeRequest`/`describeResponse`/`describeError` вместо ручной сборки меты.
 */
export interface AiLogger {
  debug(msg: string, meta?: AiLogMeta): void;
  info(msg: string, meta?: AiLogMeta): void;
  warn(msg: string, meta?: AiLogMeta): void;
  error(msg: string, meta?: AiLogMeta): void;
}

export const noopLogger: AiLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function consoleLine(level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: AiLogMeta) {
  const line = `[ai] ${msg}`;
  if (meta && Object.keys(meta).length > 0) console[level](line, meta);
  else console[level](line);
}

export const consoleLogger: AiLogger = {
  debug: (msg, meta) => consoleLine('debug', msg, meta),
  info: (msg, meta) => consoleLine('info', msg, meta),
  warn: (msg, meta) => consoleLine('warn', msg, meta),
  error: (msg, meta) => consoleLine('error', msg, meta),
};

/** Убирает `undefined`-поля, чтобы мета в логах была компактной. */
export function compactMeta<T extends AiLogMeta>(meta: T): Partial<T> {
  const out: AiLogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

export interface AiRequestMeta extends AiLogMeta {
  promptId?: string;
  requestId?: string;
  userId?: string;
  model?: string;
  messageCount: number;
  /** Суммарный размер всех сообщений в символах. */
  chars: number;
  charsByRole: { system: number; user: number; assistant: number };
  responseFormat?: 'text' | 'json';
  temperature?: number;
  maxTokens?: number;
}

/** Безопасная мета запроса: только размеры и идентификаторы, без текста. */
export function describeRequest(req: AiChatRequest): AiRequestMeta {
  const charsByRole = { system: 0, user: 0, assistant: 0 };
  let chars = 0;
  for (const message of req.messages) {
    const length = message.content.length;
    chars += length;
    charsByRole[message.role] += length;
  }
  return compactMeta({
    promptId: req.metadata?.promptId,
    requestId: req.metadata?.requestId,
    userId: req.metadata?.userId,
    model: req.model,
    messageCount: req.messages.length,
    chars,
    charsByRole,
    responseFormat: req.responseFormat,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
  }) as AiRequestMeta;
}

export interface AiResponseMeta extends AiLogMeta {
  responseModel: string;
  responseChars: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
}

/** Безопасная мета ответа: размер, токены, модель. */
export function describeResponse(res: AiChatResponse): AiResponseMeta {
  return compactMeta({
    responseModel: res.model,
    responseChars: res.content.length,
    promptTokens: res.usage?.promptTokens,
    completionTokens: res.usage?.completionTokens,
    totalTokens: res.usage?.totalTokens,
    finishReason: res.finishReason,
  }) as AiResponseMeta;
}

export interface AiEmbedRequestMeta extends AiLogMeta {
  promptId?: string;
  requestId?: string;
  userId?: string;
  model?: string;
  inputCount: number;
  chars: number;
}

export function describeEmbedRequest(req: AiEmbedRequest): AiEmbedRequestMeta {
  return compactMeta({
    promptId: req.metadata?.promptId,
    requestId: req.metadata?.requestId,
    userId: req.metadata?.userId,
    model: req.model,
    inputCount: req.input.length,
    chars: req.input.reduce((sum, text) => sum + text.length, 0),
  }) as AiEmbedRequestMeta;
}

export interface AiErrorMeta extends AiLogMeta {
  errorCode: string;
  errorMessage: string;
  errorStatus?: number;
  retryable?: boolean;
}

/** Мета ошибки: код, статус, сообщение (сообщения `AiProviderError` не содержат текста запросов). */
export function describeError(error: unknown): AiErrorMeta {
  if (isAiProviderError(error)) {
    return compactMeta({
      errorCode: error.code,
      errorMessage: error.message,
      errorStatus: error.status,
      retryable: error.retryable,
    }) as AiErrorMeta;
  }
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return { errorCode: name, errorMessage: message };
}
