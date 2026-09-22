import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiLogMeta, AiLogger } from '../../logger';
import type { AiStreamChunk } from '../../types';
import { normalizeExpiresAt } from './auth';
import { GigaChatProvider, type GigaChatProviderOptions } from './client';
import { mapHttpError, parseRetryAfter } from './errors';
import type { FetchLike } from './http';

// ---------- Тестовая обвязка: fetch без сети ----------

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  dispatcher?: unknown;
}

type Router = (req: RecordedRequest, index: number) => Response | Promise<Response>;

function mockFetch(router: Router) {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const req: RecordedRequest = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : undefined,
      signal: init?.signal ?? undefined,
      dispatcher: (init as { dispatcher?: unknown } | undefined)?.dispatcher,
    };
    requests.push(req);
    if (req.signal?.aborted) throw req.signal.reason ?? new DOMException('aborted', 'AbortError');
    return router(req, requests.length - 1);
  };
  return { fetchImpl, requests };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
  });

const NOW = 1_800_000_000_000;
const OAUTH_URL = 'https://oauth.test/api/v2/oauth';
const API_URL = 'https://api.test/api/v1';
const AUTH_KEY = 'c2VjcmV0LWtleQ==';
const SECRET_TEXT = 'секретный текст сообщения';

const oauthOk = (token = 'tok-1', expiresAt = NOW + 30 * 60 * 1000) =>
  json({ access_token: token, expires_at: expiresAt });

const chatOk = (content = 'ответ модели') =>
  json({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }],
    model: 'GigaChat',
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });

const isOauth = (req: RecordedRequest) => req.url === OAUTH_URL;

/** Промис, который «висит» до отмены сигнала — как настоящий fetch. */
const hang = (signal?: AbortSignal) =>
  new Promise<Response>((_, reject) => {
    signal?.addEventListener(
      'abort',
      () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')),
      { once: true },
    );
  });

function sseResponse(text: string, cuts: number[] = []): Response {
  const bytes = new TextEncoder().encode(text);
  const points = [0, ...cuts, bytes.length];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < points.length - 1; i += 1) {
        controller.enqueue(bytes.slice(points[i], points[i + 1]));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function memoryLogger() {
  const entries: Array<{ level: string; msg: string; meta?: AiLogMeta }> = [];
  const logger: AiLogger = {
    debug: (msg, meta) => entries.push({ level: 'debug', msg, meta }),
    info: (msg, meta) => entries.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => entries.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => entries.push({ level: 'error', msg, meta }),
  };
  return { logger, entries };
}

function makeProvider(fetchImpl: FetchLike, overrides: Partial<GigaChatProviderOptions> = {}) {
  const clock = { now: NOW };
  const { logger, entries } = memoryLogger();
  const provider = new GigaChatProvider({
    authKey: AUTH_KEY,
    oauthUrl: OAUTH_URL,
    apiUrl: API_URL,
    fetch: fetchImpl,
    logger,
    now: () => clock.now,
    uuid: () => '11111111-1111-4111-8111-111111111111',
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 2,
    ...overrides,
  });
  return { provider, clock, entries };
}

const userMessage = (content = SECRET_TEXT) => ({
  messages: [{ role: 'user' as const, content }],
});

async function collect(iterable: AsyncIterable<AiStreamChunk>) {
  const chunks: AiStreamChunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

// ---------- OAuth ----------

describe('GigaChatProvider: OAuth', () => {
  it('получает токен с нужными заголовками и кэширует его', async () => {
    const { fetchImpl, requests } = mockFetch((req) => (isOauth(req) ? oauthOk() : chatOk()));
    const { provider } = makeProvider(fetchImpl);

    await provider.chat(userMessage());
    await provider.chat(userMessage());

    expect(requests.map((r) => r.url)).toEqual([
      OAUTH_URL,
      `${API_URL}/chat/completions`,
      `${API_URL}/chat/completions`,
    ]);
    const oauth = requests[0]!;
    expect(oauth.method).toBe('POST');
    expect(oauth.headers).toMatchObject({
      Authorization: `Basic ${AUTH_KEY}`,
      RqUID: '11111111-1111-4111-8111-111111111111',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(oauth.body).toBe('scope=GIGACHAT_API_PERS');
    expect(requests[1]?.headers.Authorization).toBe('Bearer tok-1');
    expect(requests[2]?.headers.Authorization).toBe('Bearer tok-1');
  });

  it('обновляет токен за 60 секунд до истечения', async () => {
    let tokens = 0;
    const { fetchImpl, requests } = mockFetch((req) =>
      isOauth(req) ? oauthOk(`tok-${++tokens}`, NOW + 120_000) : chatOk(),
    );
    const { provider, clock } = makeProvider(fetchImpl);

    await provider.chat(userMessage());
    clock.now = NOW + 50_000; // до истечения 70 с — ещё свежий
    await provider.chat(userMessage());
    clock.now = NOW + 70_000; // до истечения 50 с — пора обновлять
    await provider.chat(userMessage());

    expect(requests.filter(isOauth)).toHaveLength(2);
    expect(requests.at(-1)?.headers.Authorization).toBe('Bearer tok-2');
  });

  it('параллельные запросы ждут одно обновление токена', async () => {
    const { fetchImpl, requests } = mockFetch((req) => (isOauth(req) ? oauthOk() : chatOk()));
    const { provider } = makeProvider(fetchImpl);
    await Promise.all([provider.chat(userMessage()), provider.chat(userMessage())]);
    expect(requests.filter(isOauth)).toHaveLength(1);
  });

  it('при 401 сбрасывает токен и повторяет запрос один раз', async () => {
    let tokens = 0;
    let chats = 0;
    const { fetchImpl, requests } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk(`tok-${++tokens}`);
      chats += 1;
      return chats === 1
        ? json({ message: 'expired' }, { status: 401 })
        : chatOk('после обновления');
    });
    const { provider, entries } = makeProvider(fetchImpl);

    const res = await provider.chat(userMessage());
    expect(res.content).toBe('после обновления');
    expect(requests.map((r) => r.url === OAUTH_URL)).toEqual([true, false, true, false]);
    expect(requests[3]?.headers.Authorization).toBe('Bearer tok-2');
    expect(entries.some((e) => e.msg === 'gigachat.auth.expired')).toBe(true);
  });

  it('повторный 401 — ошибка AUTH без зацикливания', async () => {
    const { fetchImpl, requests } = mockFetch((req) =>
      isOauth(req) ? oauthOk() : json({ message: 'nope' }, { status: 401 }),
    );
    const { provider } = makeProvider(fetchImpl);
    await expect(provider.chat(userMessage())).rejects.toMatchObject({
      code: 'AUTH',
      status: 401,
      retryable: false,
    });
    expect(requests).toHaveLength(4);
  });

  it('ошибка OAuth (401) — AUTH, без ретраев', async () => {
    const { fetchImpl, requests } = mockFetch(() => json({ message: 'bad key' }, { status: 401 }));
    const { provider } = makeProvider(fetchImpl);
    await expect(provider.chat(userMessage())).rejects.toMatchObject({ code: 'AUTH' });
    expect(requests).toHaveLength(1);
  });

  it('normalizeExpiresAt: секунды → миллисекунды', () => {
    expect(normalizeExpiresAt(1_800_000_000)).toBe(1_800_000_000_000);
    expect(normalizeExpiresAt(1_800_000_000_000)).toBe(1_800_000_000_000);
  });
});

// ---------- Chat ----------

describe('GigaChatProvider: chat', () => {
  it('отправляет тело и разбирает ответ', async () => {
    const { fetchImpl, requests } = mockFetch((req) => (isOauth(req) ? oauthOk() : chatOk()));
    const { provider } = makeProvider(fetchImpl, { model: 'GigaChat-Pro' });

    const res = await provider.chat({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.3,
      maxTokens: 100,
      metadata: { requestId: '22222222-2222-4222-8222-222222222222' },
    });

    expect(res).toMatchObject({
      content: 'ответ модели',
      model: 'GigaChat',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    });
    const chat = requests[1]!;
    expect(chat.method).toBe('POST');
    expect(chat.headers).toMatchObject({
      Authorization: 'Bearer tok-1',
      'Content-Type': 'application/json',
      'X-Request-ID': '22222222-2222-4222-8222-222222222222',
    });
    expect(JSON.parse(chat.body ?? '')).toEqual({
      model: 'GigaChat-Pro',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 100,
    });
  });

  it('429 → RATE_LIMITED с ретраем и Retry-After', async () => {
    let chats = 0;
    const { fetchImpl, requests } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk();
      chats += 1;
      return chats === 1
        ? json({ message: 'Too many' }, { status: 429, headers: { 'retry-after': '0' } })
        : chatOk('ок');
    });
    const { provider, entries } = makeProvider(fetchImpl);
    const res = await provider.chat(userMessage());
    expect(res.content).toBe('ок');
    expect(requests).toHaveLength(3);
    const retry = entries.find((e) => e.msg === 'gigachat.retry');
    expect(retry?.meta).toMatchObject({ op: 'chat', attempt: 1, errorCode: 'RATE_LIMITED' });
  });

  it('429 после исчерпания ретраев — ошибка RATE_LIMITED', async () => {
    const { fetchImpl, requests } = mockFetch((req) =>
      isOauth(req) ? oauthOk() : json({ message: 'Too many' }, { status: 429 }),
    );
    const { provider } = makeProvider(fetchImpl, { maxRetries: 2 });
    await expect(provider.chat(userMessage())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
    });
    expect(requests.filter((r) => !isOauth(r))).toHaveLength(3);
  });

  it('маппинг ошибок: 500 → UNAVAILABLE, 400 → UNKNOWN, не-JSON → INVALID_RESPONSE, TypeError → NETWORK', async () => {
    const cases: Array<[() => Response | Promise<Response>, string, boolean]> = [
      [() => json({ message: 'oops' }, { status: 503 }), 'UNAVAILABLE', true],
      [() => json({ message: 'bad' }, { status: 400 }), 'UNKNOWN', false],
      [() => new Response('<html>', { status: 200 }), 'INVALID_RESPONSE', false],
      [() => json({ choices: [] }), 'INVALID_RESPONSE', false],
      [() => Promise.reject(new TypeError('fetch failed')), 'NETWORK', true],
    ];
    for (const [respond, code, retryable] of cases) {
      const { fetchImpl } = mockFetch((req) => (isOauth(req) ? oauthOk() : respond()));
      const { provider } = makeProvider(fetchImpl, { maxRetries: 0 });
      await expect(provider.chat(userMessage())).rejects.toMatchObject({ code, retryable });
    }
  });

  it('таймаут → TIMEOUT', async () => {
    const { fetchImpl } = mockFetch((req) => (isOauth(req) ? oauthOk() : hang(req.signal)));
    const { provider } = makeProvider(fetchImpl, { timeoutMs: 20, maxRetries: 0 });
    await expect(provider.chat(userMessage())).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });

  it('отмена вызывающим пробрасывается как есть', async () => {
    const { fetchImpl } = mockFetch((req) => (isOauth(req) ? oauthOk() : hang(req.signal)));
    const { provider } = makeProvider(fetchImpl);
    const controller = new AbortController();
    const promise = provider.chat({ ...userMessage(), signal: controller.signal });
    setTimeout(() => controller.abort(new Error('user left')), 5);
    await expect(promise).rejects.toThrow('user left');
  });

  it('в логах нет ключа, токена и текста сообщений', async () => {
    let chats = 0;
    const { fetchImpl } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk('super-secret-token');
      chats += 1;
      return chats === 1 ? json({ message: 'x' }, { status: 429 }) : chatOk(SECRET_TEXT);
    });
    const { provider, entries } = makeProvider(fetchImpl);
    await provider.chat(userMessage());
    const dump = JSON.stringify(entries);
    expect(entries.length).toBeGreaterThan(0);
    expect(dump).not.toContain(AUTH_KEY);
    expect(dump).not.toContain('super-secret-token');
    expect(dump).not.toContain(SECRET_TEXT);
  });
});

// ---------- Stream ----------

describe('GigaChatProvider: параллельность', () => {
  it('maxConcurrency=1: второй запрос уходит только после ответа на первый', async () => {
    let resolveFirst: ((r: Response) => void) | undefined;
    let chats = 0;
    const { fetchImpl } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk();
      chats += 1;
      if (chats === 1) return new Promise<Response>((resolve) => (resolveFirst = resolve));
      return chatOk('второй');
    });
    const { provider } = makeProvider(fetchImpl);
    const first = provider.chat(userMessage('a'));
    const second = provider.chat(userMessage('b'));
    await new Promise((r) => setTimeout(r, 5));
    expect(chats).toBe(1);
    expect(provider.queued).toBe(1);
    resolveFirst!(chatOk('первый'));
    expect((await first).content).toBe('первый');
    expect((await second).content).toBe('второй');
    expect(chats).toBe(2);
  });

  it('maxConcurrency=2: два запроса в полёте одновременно', async () => {
    let chats = 0;
    const pending: Array<(r: Response) => void> = [];
    const { fetchImpl } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk();
      chats += 1;
      return new Promise<Response>((resolve) => pending.push(resolve));
    });
    const { provider } = makeProvider(fetchImpl, { maxConcurrency: 2 });
    const a = provider.chat(userMessage('a'));
    const b = provider.chat(userMessage('b'));
    await new Promise((r) => setTimeout(r, 5));
    expect(chats).toBe(2);
    pending.forEach((resolve) => resolve(chatOk('ok')));
    await Promise.all([a, b]);
  });

  it('стрим держит слот до конца итерации, отмена в очереди завершает стрим без чанков', async () => {
    let resolveFirst: ((r: Response) => void) | undefined;
    const { fetchImpl } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk();
      return new Promise<Response>((resolve) => (resolveFirst = resolve));
    });
    const { provider } = makeProvider(fetchImpl);
    const first = provider.chat(userMessage('a'));
    const ctrl = new AbortController();
    const chunksPromise = collect(provider.stream({ ...userMessage('b'), signal: ctrl.signal }));
    await new Promise((r) => setTimeout(r, 5));
    expect(provider.queued).toBe(1);
    ctrl.abort();
    expect(await chunksPromise).toEqual([]);
    resolveFirst!(chatOk('первый'));
    await first;
    expect(provider.queued).toBe(0);
  });
});

describe('GigaChatProvider: stream', () => {
  const sseText =
    'data: {"choices":[{"delta":{"role":"assistant","content":"При"},"index":0}],"model":"GigaChat"}\n\n' +
    'data: {"choices":[{"delta":{"content":"вет, "},"index":0}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"мир"},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}}\n\n' +
    'data: [DONE]\n\n';

  it('разбирает SSE по чанкам и завершает done с usage', async () => {
    const { fetchImpl, requests } = mockFetch((req) =>
      isOauth(req) ? oauthOk() : sseResponse(sseText, [17, 60, 61, 150]),
    );
    const { provider } = makeProvider(fetchImpl);

    const chunks = await collect(provider.stream(userMessage()));
    const tokens = chunks.filter((c) => c.type === 'token').map((c) => c.text);
    expect(tokens).toEqual(['При', 'вет, ', 'мир']);
    expect(chunks.at(-1)).toEqual({
      type: 'done',
      response: {
        content: 'Привет, мир',
        model: 'GigaChat',
        usage: { promptTokens: 4, completionTokens: 3, totalTokens: 7 },
        finishReason: 'stop',
      },
    });
    const req = requests[1]!;
    expect(req.headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(req.body ?? '')).toMatchObject({ stream: true });
  });

  it('ошибка до тела (429 с ретраями) → чанк error', async () => {
    const { fetchImpl, requests } = mockFetch((req) =>
      isOauth(req) ? oauthOk() : json({ message: 'x' }, { status: 429 }),
    );
    const { provider } = makeProvider(fetchImpl, { maxRetries: 1 });
    const chunks = await collect(provider.stream(userMessage()));
    expect(chunks).toEqual([
      { type: 'error', error: expect.objectContaining({ code: 'RATE_LIMITED' }) },
    ]);
    expect(requests.filter((r) => !isOauth(r))).toHaveLength(2);
  });

  it('битый чанк → error INVALID_RESPONSE после уже отданных токенов', async () => {
    const { fetchImpl } = mockFetch((req) =>
      isOauth(req)
        ? oauthOk()
        : sseResponse('data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {oops\n\n'),
    );
    const { provider } = makeProvider(fetchImpl);
    const chunks = await collect(provider.stream(userMessage()));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'token', text: 'a' });
    expect(chunks[1]).toMatchObject({ type: 'error', error: { code: 'INVALID_RESPONSE' } });
  });

  it('idle-таймаут стрима → error TIMEOUT', async () => {
    const { fetchImpl } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'),
          );
          // дальше сервер молчит
        },
      });
      return new Response(stream, { status: 200 });
    });
    const { provider } = makeProvider(fetchImpl, { streamIdleTimeoutMs: 20 });
    const chunks = await collect(provider.stream(userMessage()));
    expect(chunks[0]).toEqual({ type: 'token', text: 'a' });
    expect(chunks[1]).toMatchObject({ type: 'error', error: { code: 'TIMEOUT' } });
  });

  it('отмена вызывающим завершает итерацию без done и error', async () => {
    const { fetchImpl } = mockFetch((req) => {
      if (isOauth(req)) return oauthOk();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'),
          );
        },
      });
      return new Response(stream, { status: 200 });
    });
    const { provider } = makeProvider(fetchImpl);
    const controller = new AbortController();
    const chunks: AiStreamChunk[] = [];
    for await (const chunk of provider.stream({ ...userMessage(), signal: controller.signal })) {
      chunks.push(chunk);
      controller.abort();
    }
    expect(chunks).toEqual([{ type: 'token', text: 'a' }]);
  });

  it('таймаут до заголовков → error TIMEOUT', async () => {
    const { fetchImpl } = mockFetch((req) => (isOauth(req) ? oauthOk() : hang(req.signal)));
    const { provider } = makeProvider(fetchImpl, { timeoutMs: 20, maxRetries: 0 });
    const chunks = await collect(provider.stream(userMessage()));
    expect(chunks).toEqual([
      { type: 'error', error: expect.objectContaining({ code: 'TIMEOUT' }) },
    ]);
  });
});

// ---------- Embeddings ----------

describe('GigaChatProvider: embed', () => {
  it('отправляет input и собирает векторы по index', async () => {
    const { fetchImpl, requests } = mockFetch((req) =>
      isOauth(req)
        ? oauthOk()
        : json({
            object: 'list',
            model: 'Embeddings',
            data: [
              { object: 'embedding', embedding: [0.3, 0.4], index: 1, usage: { prompt_tokens: 2 } },
              { object: 'embedding', embedding: [0.1, 0.2], index: 0, usage: { prompt_tokens: 3 } },
            ],
          }),
    );
    const { provider } = makeProvider(fetchImpl);
    const res = await provider.embed({ input: ['a', 'b'] });
    expect(res).toEqual({
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      model: 'Embeddings',
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
    });
    const req = requests[1]!;
    expect(req.url).toBe(`${API_URL}/embeddings`);
    expect(JSON.parse(req.body ?? '')).toEqual({ model: 'Embeddings', input: ['a', 'b'] });
  });
});

// ---------- Разное ----------

describe('GigaChatProvider: конфиг', () => {
  it('требует authKey', () => {
    expect(() => new GigaChatProvider({ authKey: '' })).toThrow(/authKey/);
  });

  it('с caCertPath создаёт dispatcher и передаёт его в fetch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edu-ai-'));
    const pem = join(dir, 'ca.pem');
    writeFileSync(
      pem,
      '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUJ8v0\n-----END CERTIFICATE-----\n',
    );
    const { fetchImpl, requests } = mockFetch((req) => (isOauth(req) ? oauthOk() : chatOk()));
    const { provider } = makeProvider(fetchImpl, { caCertPath: pem });
    await provider.chat(userMessage());
    expect(requests[0]?.dispatcher).toBeDefined();
    await provider.close();
  });

  it('несуществующий caCertPath — ошибка при создании', () => {
    expect(() => makeProvider(async () => chatOk(), { caCertPath: '/nope/ca.pem' })).toThrow();
  });
});

describe('mapHttpError / parseRetryAfter', () => {
  it('маппит статусы и достаёт message из тела', () => {
    expect(mapHttpError(401, '{"message":"Unauthorized"}', undefined, 'chat')).toMatchObject({
      code: 'AUTH',
      status: 401,
      message: 'GigaChat chat: HTTP 401 — Unauthorized',
    });
    expect(mapHttpError(403, '', undefined, 'chat').code).toBe('AUTH');
    expect(mapHttpError(408, '', undefined, 'chat').code).toBe('TIMEOUT');
    expect(mapHttpError(502, 'not json', undefined, 'chat')).toMatchObject({
      code: 'UNAVAILABLE',
      message: 'GigaChat chat: HTTP 502',
    });
    const limited = mapHttpError(429, '', new Headers({ 'retry-after': '3' }), 'chat');
    expect(limited).toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 3000 });
  });

  it('parseRetryAfter: секунды и дата', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter(new Date(NOW + 5000).toUTCString(), NOW)).toBe(5000);
    expect(parseRetryAfter('garbage')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
