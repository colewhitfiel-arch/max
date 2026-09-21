import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import type { ZodTypeAny, z } from 'zod';
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

/** Тонкая обёртка над fetch: таймаут, маппинг сетевых и HTTP-ошибок, TLS-агент с кастомным CA. */
export class GigaChatHttp {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly dispatcher?: Dispatcher,
  ) {}

  async request(opts: HttpRequestOptions): Promise<Response> {
    const init: InitWithDispatcher = { method: opts.method, headers: opts.headers };
    if (opts.body !== undefined) init.body = opts.body;
    if (this.dispatcher) init.dispatcher = this.dispatcher;
    const doFetch = (signal?: AbortSignal) =>
      this.fetchImpl(opts.url, { ...init, signal } as RequestInit);

    let response: Response;
    try {
      response =
        opts.timeoutMs > 0
          ? await withTimeout(doFetch, opts.timeoutMs, opts.signal)
          : await doFetch(opts.signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw mapFetchError(error, opts.op);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw mapHttpError(response.status, text, response.headers, opts.op);
    }
    return response;
  }

  async close(): Promise<void> {
    await this.dispatcher?.close();
  }
}

/** Читает JSON-тело и валидирует схемой; проблемы → `INVALID_RESPONSE`. */
export async function readJson<S extends ZodTypeAny>(
  response: Response,
  schema: S,
  op: string,
): Promise<z.output<S>> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new AiProviderError('NETWORK', `GigaChat ${op}: не удалось прочитать ответ`, {
      cause: error,
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AiProviderError('INVALID_RESPONSE', `GigaChat ${op}: ответ не является JSON`, {
      retryable: false,
      cause: error,
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
