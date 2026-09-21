import { randomUUID } from 'node:crypto';
import { linkAbortSignal, throwIfAborted } from '../../abort';
import type { AiLogger } from '../../logger';
import { describeError, noopLogger } from '../../logger';
import type { AiProvider } from '../../provider';
import { withRetry } from '../../retry';
import { Semaphore } from '../../semaphore';
import type {
  AiChatRequest,
  AiChatResponse,
  AiEmbedRequest,
  AiEmbedResponse,
  AiStreamChunk,
  AiUsage,
} from '../../types';
import { AiProviderError, isAiProviderError, toAiProviderError } from '../../types';
import { GigaChatTokenManager } from './auth';
import { mapFetchError } from './errors';
import type { FetchLike, GigaChatHttp, HttpRequestOptions } from './http';
import { createGigaChatHttp, readJson } from './http';
import {
  ChatChunkSchema,
  ChatCompletionSchema,
  EmbeddingsResponseSchema,
  toUsage,
} from './schemas';
import { parseSse } from './sse';

export interface GigaChatProviderOptions {
  /** Authorization key из личного кабинета (base64 `client_id:client_secret`). */
  authKey: string;
  scope?: string;
  model?: string;
  embeddingsModel?: string;
  oauthUrl?: string;
  apiUrl?: string;
  /** Таймаут запроса (для стрима — до получения заголовков). */
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  /** Минимальная пауза при 429 без `Retry-After` (растёт экспоненциально). */
  rateLimitDelayMs?: number;
  /**
   * Сколько запросов (chat/stream/embed) держать в полёте одновременно. Персональный тариф
   * GigaChat (`GIGACHAT_API_PERS`) принимает один запрос за раз — остальные отвечают 429.
   * Для B2B/CORP можно поднять. Стрим занимает слот до конца итерации.
   */
  maxConcurrency?: number;
  /** За сколько до истечения обновлять OAuth-токен. */
  tokenRefreshSkewMs?: number;
  /** Пауза между чанками стрима, после которой он считается зависшим. По умолчанию = timeoutMs. */
  streamIdleTimeoutMs?: number;
  /** PEM корневого сертификата НУЦ Минцифры. Пусто — системные CA. */
  caCertPath?: string;
  fetch?: FetchLike;
  logger?: AiLogger;
  /** Часы и генератор RqUID — подменяются в тестах. */
  now?: () => number;
  uuid?: () => string;
}

export const GIGACHAT_DEFAULTS = {
  scope: 'GIGACHAT_API_PERS',
  model: 'GigaChat-2',
  embeddingsModel: 'Embeddings',
  oauthUrl: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  apiUrl: 'https://gigachat.devices.sberbank.ru/api/v1',
  timeoutMs: 30_000,
  maxRetries: 3,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 20_000,
  rateLimitDelayMs: 2_000,
  maxConcurrency: 1,
  tokenRefreshSkewMs: 60_000,
} as const;

interface ResolvedConfig {
  authKey: string;
  scope: string;
  model: string;
  embeddingsModel: string;
  oauthUrl: string;
  apiUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  rateLimitDelayMs: number;
  tokenRefreshSkewMs: number;
  streamIdleTimeoutMs: number;
  now: () => number;
  uuid: () => string;
}

type RequestBuilder = (
  token: string,
) => Pick<HttpRequestOptions, 'url' | 'method' | 'headers' | 'body'>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Адаптер GigaChat API (Sber) за портом `AiProvider`.
 * Ключ и токен не логируются; содержимое сообщений — тоже.
 */
export class GigaChatProvider implements AiProvider {
  readonly name = 'gigachat';

  private readonly config: ResolvedConfig;
  private readonly http: GigaChatHttp;
  private readonly tokens: GigaChatTokenManager;
  private readonly logger: AiLogger;
  private readonly slots: Semaphore;

  constructor(options: GigaChatProviderOptions) {
    if (!options.authKey) throw new Error('GigaChatProvider: authKey обязателен');
    const timeoutMs = options.timeoutMs ?? GIGACHAT_DEFAULTS.timeoutMs;
    this.config = {
      authKey: options.authKey,
      scope: options.scope ?? GIGACHAT_DEFAULTS.scope,
      model: options.model ?? GIGACHAT_DEFAULTS.model,
      embeddingsModel: options.embeddingsModel ?? GIGACHAT_DEFAULTS.embeddingsModel,
      oauthUrl: options.oauthUrl ?? GIGACHAT_DEFAULTS.oauthUrl,
      apiUrl: (options.apiUrl ?? GIGACHAT_DEFAULTS.apiUrl).replace(/\/+$/, ''),
      timeoutMs,
      maxRetries: options.maxRetries ?? GIGACHAT_DEFAULTS.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs ?? GIGACHAT_DEFAULTS.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs ?? GIGACHAT_DEFAULTS.retryMaxDelayMs,
      rateLimitDelayMs: options.rateLimitDelayMs ?? GIGACHAT_DEFAULTS.rateLimitDelayMs,
      tokenRefreshSkewMs: options.tokenRefreshSkewMs ?? GIGACHAT_DEFAULTS.tokenRefreshSkewMs,
      streamIdleTimeoutMs: options.streamIdleTimeoutMs ?? timeoutMs,
      now: options.now ?? Date.now,
      uuid: options.uuid ?? randomUUID,
    };
    this.logger = options.logger ?? noopLogger;
    this.slots = new Semaphore(options.maxConcurrency ?? GIGACHAT_DEFAULTS.maxConcurrency);
    this.http = createGigaChatHttp({ fetch: options.fetch, caCertPath: options.caCertPath });
    this.tokens = new GigaChatTokenManager(
      this.http,
      {
        authKey: this.config.authKey,
        scope: this.config.scope,
        oauthUrl: this.config.oauthUrl,
        timeoutMs: this.config.timeoutMs,
        refreshSkewMs: this.config.tokenRefreshSkewMs,
        now: this.config.now,
        uuid: this.config.uuid,
      },
      this.logger,
    );
  }

  get model(): string {
    return this.config.model;
  }

  /** Сколько запросов ждут свободного слота (для метрик и тестов). */
  get queued(): number {
    return this.slots.waiting;
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    const release = await this.slots.acquire(req.signal);
    try {
      return await this.chatUnbounded(req);
    } finally {
      release();
    }
  }

  async *stream(req: AiChatRequest): AsyncIterable<AiStreamChunk> {
    let release: () => void;
    try {
      release = await this.slots.acquire(req.signal);
    } catch {
      return; // отмена вызывающим во время ожидания слота — как отмена стрима
    }
    try {
      yield* this.streamUnbounded(req);
    } finally {
      release();
    }
  }

  async embed(req: AiEmbedRequest): Promise<AiEmbedResponse> {
    const release = await this.slots.acquire(req.signal);
    try {
      return await this.embedUnbounded(req);
    } finally {
      release();
    }
  }

  private async chatUnbounded(req: AiChatRequest): Promise<AiChatResponse> {
    const model = req.model ?? this.config.model;
    const body = JSON.stringify(buildChatBody(req, model, false));
    const response = await this.withRetries('chat', req.signal, () =>
      this.authorized('chat', req.signal, this.config.timeoutMs, (token) => ({
        url: `${this.config.apiUrl}/chat/completions`,
        method: 'POST',
        headers: jsonHeaders(token, req),
        body,
      })),
    );
    const data = await readJson(response, ChatCompletionSchema, 'chat');
    const choice = data.choices[0];
    if (!choice) {
      throw new AiProviderError('INVALID_RESPONSE', 'GigaChat chat: пустой список choices', {
        retryable: false,
      });
    }
    const result: AiChatResponse = {
      content: choice.message.content,
      model: data.model ?? model,
      raw: data,
    };
    const usage = toUsage(data.usage);
    if (usage) result.usage = usage;
    if (choice.finish_reason) result.finishReason = choice.finish_reason;
    return result;
  }

  private async *streamUnbounded(req: AiChatRequest): AsyncIterable<AiStreamChunk> {
    const model = req.model ?? this.config.model;
    const body = JSON.stringify(buildChatBody(req, model, true));

    // Мастер-контроллер живёт всё время стрима: внешняя отмена и idle-таймаут прерывают чтение тела.
    const master = new AbortController();
    const unlinkMaster = linkAbortSignal(master, req.signal);
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdle = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        master.abort(
          new AiProviderError(
            'TIMEOUT',
            `GigaChat stream: нет данных ${this.config.streamIdleTimeoutMs} мс`,
          ),
        );
      }, this.config.streamIdleTimeoutMs);
    };
    const cleanup = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      unlinkMaster();
    };

    // Соединение: каждая попытка со своим таймаутом до заголовков; тело остаётся привязанным к master.
    const connect = async () => {
      const attempt = new AbortController();
      const unlinkAttempt = linkAbortSignal(attempt, master.signal);
      const timer = setTimeout(() => {
        attempt.abort(
          new AiProviderError('TIMEOUT', `Превышен таймаут ${this.config.timeoutMs} мс`),
        );
      }, this.config.timeoutMs);
      try {
        const response = await this.authorized('stream', attempt.signal, 0, (token) => ({
          url: `${this.config.apiUrl}/chat/completions`,
          method: 'POST',
          headers: { ...jsonHeaders(token, req), Accept: 'text/event-stream' },
          body,
        }));
        return { response, signal: attempt.signal };
      } catch (error) {
        unlinkAttempt();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };

    let connection: { response: Response; signal: AbortSignal };
    try {
      connection = await this.withRetries('stream', master.signal, connect);
    } catch (error) {
      cleanup();
      if (isCallerAbort(master.signal)) return;
      yield { type: 'error', error: toAiProviderError(error) };
      return;
    }

    const { response, signal } = connection;
    if (!response.body) {
      cleanup();
      yield {
        type: 'error',
        error: new AiProviderError('INVALID_RESPONSE', 'GigaChat stream: пустое тело ответа', {
          retryable: false,
        }),
      };
      return;
    }

    const parts: string[] = [];
    let responseModel: string | undefined;
    let usage: AiUsage | undefined;
    let finishReason: string | undefined;

    try {
      armIdle();
      for await (const event of parseSse(response.body, signal)) {
        armIdle();
        if (event.data.trim() === '[DONE]') break;
        const chunk = parseChunk(event.data);
        if (chunk.model) responseModel = chunk.model;
        const chunkUsage = toUsage(chunk.usage);
        if (chunkUsage) usage = chunkUsage;
        const choice = chunk.choices[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const text = choice.delta?.content;
        if (text) {
          parts.push(text);
          yield { type: 'token', text };
        }
      }
    } catch (error) {
      cleanup();
      if (isCallerAbort(master.signal) || isCallerAbort(signal)) return;
      const reason = signal.aborted ? signal.reason : error;
      yield {
        type: 'error',
        error: isAiProviderError(reason) ? reason : mapFetchError(reason, 'stream'),
      };
      return;
    }
    cleanup();

    const result: AiChatResponse = { content: parts.join(''), model: responseModel ?? model };
    if (usage) result.usage = usage;
    if (finishReason) result.finishReason = finishReason;
    yield { type: 'done', response: result };
  }

  private async embedUnbounded(req: AiEmbedRequest): Promise<AiEmbedResponse> {
    const model = req.model ?? this.config.embeddingsModel;
    const body = JSON.stringify({ model, input: req.input });
    const response = await this.withRetries('embeddings', req.signal, () =>
      this.authorized('embeddings', req.signal, this.config.timeoutMs, (token) => ({
        url: `${this.config.apiUrl}/embeddings`,
        method: 'POST',
        headers: jsonHeaders(token, req),
        body,
      })),
    );
    const data = await readJson(response, EmbeddingsResponseSchema, 'embeddings');
    const items = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const perItemTokens = items.reduce((sum, item) => sum + (item.usage?.prompt_tokens ?? 0), 0);
    const promptTokens = perItemTokens || data.usage?.prompt_tokens || 0;
    const result: AiEmbedResponse = {
      vectors: items.map((item) => item.embedding),
      model: data.model ?? model,
    };
    if (promptTokens > 0) {
      result.usage = { promptTokens, completionTokens: 0, totalTokens: promptTokens };
    }
    return result;
  }

  /** Закрывает TLS-агент (если был создан для `caCertPath`). */
  async close(): Promise<void> {
    await this.http.close();
  }

  private withRetries<T>(op: string, signal: AbortSignal | undefined, fn: () => Promise<T>) {
    return withRetry(fn, {
      maxRetries: this.config.maxRetries,
      baseDelayMs: this.config.retryBaseDelayMs,
      maxDelayMs: this.config.retryMaxDelayMs,
      rateLimitDelayMs: this.config.rateLimitDelayMs,
      signal,
      onRetry: ({ error, attempt, delayMs }) => {
        this.logger.warn('gigachat.retry', { op, attempt, delayMs, ...describeError(error) });
      },
    });
  }

  /** Запрос с Bearer-токеном; при 401 — сброс кэша токена и одна повторная попытка. */
  private async authorized(
    op: string,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    build: RequestBuilder,
  ): Promise<Response> {
    let token = await this.tokens.getToken();
    throwIfAborted(signal);
    try {
      return await this.http.request({ ...build(token), signal, timeoutMs, op });
    } catch (error) {
      if (isAiProviderError(error) && error.code === 'AUTH' && error.status === 401) {
        this.logger.warn('gigachat.auth.expired', { op });
        this.tokens.invalidate();
        token = await this.tokens.getToken();
        throwIfAborted(signal);
        return this.http.request({ ...build(token), signal, timeoutMs, op });
      }
      throw error;
    }
  }
}

function buildChatBody(
  req: AiChatRequest,
  model: string,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  return body;
}

function jsonHeaders(token: string, req: AiChatRequest | AiEmbedRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const requestId = req.metadata?.requestId;
  if (requestId && UUID_PATTERN.test(requestId)) headers['X-Request-ID'] = requestId;
  return headers;
}

function parseChunk(data: string) {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch (error) {
    throw new AiProviderError('INVALID_RESPONSE', 'GigaChat stream: чанк не является JSON', {
      retryable: false,
      cause: error,
    });
  }
  const parsed = ChatChunkSchema.safeParse(json);
  if (!parsed.success) {
    throw new AiProviderError('INVALID_RESPONSE', 'GigaChat stream: неожиданная структура чанка', {
      retryable: false,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Отмена самим вызывающим (не таймаут и не ошибка провайдера). */
function isCallerAbort(signal: AbortSignal): boolean {
  return signal.aborted && !isAiProviderError(signal.reason);
}
