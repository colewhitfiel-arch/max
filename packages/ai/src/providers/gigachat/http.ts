import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import type { ZodTypeAny, z } from 'zod';
import { abortReason } from '../../abort';
import { withTimeout } from '../../timeout';
import { AiProviderError, isAbortError } from '../../types';
import { mapFetchError, mapHttpError } from './errors';

/** Инжектируемый `fetch` (в тестах — мок без сети). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type InitWithDispatcher = Omit<RequestInit, 'dispatcher'> & { dispatcher?: Dispatcher };

export interface HttpRequestOptions {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** `0` — без таймаута (для стримов: тело остаётся привязанным к `signal`). */
  timeoutMs: number;
  /** Название операции для сообщений об ошибках/логов. */
  op: string;
}

/**
 * Тонкая обёртка над fetch: таймаут, маппинг сетевых и HTTP-ошибок, TLS-агент с кастомным CA.
 * Отмена вызывающим (`opts.signal`) пробрасывается исходной причиной отмены.
 */
export class GigaChatHttp {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly dispatcher?: Dispatcher,
  ) {}

  /**
   * Запрос без чтения тела (для стрима): таймаут — только до заголовков, тело остаётся
   * привязанным к `opts.signal`. Не-2xx → `AiProviderError`.
   */
  request(opts: HttpRequestOptions): Promise<Response> {
    return this.execute(opts, (signal) => this.fetchChecked(opts, signal));
  }

  /**
   * Запрос с JSON-ответом: fetch, проверка статуса и чтение тела идут внутри одного таймаута
   * и одного сигнала отмены — зависшее после заголовков тело тоже прерывается по `timeoutMs`.
   * Проблемы с телом → `INVALID_RESPONSE`, обрыв при чтении → `NETWORK`.
   */
  async requestJson<S extends ZodTypeAny>(
    opts: HttpRequestOptions,
    schema: S,
  ): Promise<z.output<S>> {
    const text = await this.execute(opts, async (signal) => {
      const response = await this.fetchChecked(opts, signal);
      try {
        return await response.text();
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) throw error;
        throw new AiProviderError('NETWORK', `GigaChat ${opts.op}: не удалось прочитать ответ`, {
          cause: error,
        });
      }
    });
    return parseJsonBody(text, schema, opts.op);
  }

  async close(): Promise<void> {
    await this.dispatcher?.close();
  }

  private async fetchChecked(opts: HttpRequestOptions, signal?: AbortSignal): Promise<Response> {
    const init: InitWithDispatcher = { method: opts.method, headers: opts.headers };
    if (opts.body !== undefined) init.body = opts.body;
    if (this.dispatcher) init.dispatcher = this.dispatcher;
    const response = await this.fetchImpl(opts.url, { ...init, signal } as RequestInit);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw mapHttpError(response.status, text, response.headers, opts.op);
    }
    return response;
  }

  private async execute<T>(
    opts: HttpRequestOptions,
    task: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    try {
      return opts.timeoutMs > 0
        ? await withTimeout(task, opts.timeoutMs, opts.signal)
        : await task(opts.signal);
    } catch (error) {
      // Отмена вызывающим — исходной причиной (не UNKNOWN), даже если это кастомная ошибка.
      if (opts.signal?.aborted) throw abortReason(opts.signal);
      if (isAbortError(error)) throw error;
      throw mapFetchError(error, opts.op);
    }
  }
}

/**
 * Парсит JSON-тело и валидирует схемой; проблемы → `INVALID_RESPONSE`.
 * Текст `SyntaxError` не прикладывается: V8 кладёт в него фрагмент тела, а ошибки попадают в логи.
 */
export function parseJsonBody<S extends ZodTypeAny>(
  text: string,
  schema: S,
  op: string,
): z.output<S> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiProviderError('INVALID_RESPONSE', `GigaChat ${op}: ответ не является JSON`, {
      retryable: false,
    });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AiProviderError(
      'INVALID_RESPONSE',
      `GigaChat ${op}: неожиданная структура ответа (${parsed.error.issues
        .slice(0, 3)
        .map((issue) => issue.path.join('.') || '(корень)')
        .join(', ')})`,
      { retryable: false, cause: parsed.error },
    );
  }
  return parsed.data as z.output<S>;
}

export interface CreateHttpOptions {
  fetch?: FetchLike;
  caCertPath?: string;
}

/**
 * Без `caCertPath` — глобальный `fetch`. С `caCertPath` — `fetch` и `Agent` из одного пакета `undici`
 * (глобальный fetch может быть несовместим с `Agent` другой мажорной версии); системные CA сохраняются.
 */
export function createGigaChatHttp(options: CreateHttpOptions = {}): GigaChatHttp {
  if (!options.caCertPath) {
    const fetchImpl = options.fetch ?? (globalThis.fetch.bind(globalThis) as FetchLike);
    return new GigaChatHttp(fetchImpl);
  }
  const ca = readFileSync(options.caCertPath, 'utf8');
  const dispatcher = new Agent({ connect: { ca: [...tls.rootCertificates, ca] } });
  const fetchImpl = options.fetch ?? (undiciFetch as unknown as FetchLike);
  return new GigaChatHttp(fetchImpl, dispatcher);
}
