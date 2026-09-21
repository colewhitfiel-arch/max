import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAiProvider, aiConfigFromEnv } from './config';
import type { AiLogMeta, AiLogger } from './logger';
import { describeRequest } from './logger';
import { MockAiProvider } from './providers/mock';
import { AiService, createAiService } from './service';
import { AiProviderError } from './types';

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

const SECRET_TEXT = 'секретное содержимое сообщения';

describe('AiService', () => {
  it('проставляет requestId и модель по умолчанию, не трогая заданные', async () => {
    const provider = new MockAiProvider();
    const service = new AiService({
      provider,
      defaultModel: 'GigaChat-Pro',
      generateRequestId: () => 'req-1',
    });
    await service.chat({ messages: [{ role: 'user', content: 'a' }] });
    await service.chat({
      messages: [{ role: 'user', content: 'b' }],
      model: 'GigaChat-Max',
      metadata: { requestId: 'custom', promptId: 'p@1' },
    });
    expect(provider.calls[0]).toMatchObject({
      model: 'GigaChat-Pro',
      metadata: { requestId: 'req-1' },
    });
    expect(provider.calls[1]).toMatchObject({
      model: 'GigaChat-Max',
      metadata: { requestId: 'custom', promptId: 'p@1' },
    });
  });

  it('логирует безопасную мету без содержимого сообщений', async () => {
    const { logger, entries } = memoryLogger();
    const provider = new MockAiProvider({ defaultResponse: `ответ: ${SECRET_TEXT}` });
    const service = new AiService({ provider, logger, generateRequestId: () => 'req-1' });
    await service.chat({
      messages: [
        { role: 'system', content: SECRET_TEXT },
        { role: 'user', content: SECRET_TEXT },
      ],
      metadata: { promptId: 'tutor.system@1', userId: 'u1' },
    });
    const done = entries.find((e) => e.msg === 'ai.chat.done');
    expect(done?.meta).toMatchObject({
      promptId: 'tutor.system@1',
      requestId: 'req-1',
      userId: 'u1',
      messageCount: 2,
      chars: SECRET_TEXT.length * 2,
      charsByRole: { system: SECRET_TEXT.length, user: SECRET_TEXT.length, assistant: 0 },
    });
    expect(typeof done?.meta?.durationMs).toBe('number');
    expect(JSON.stringify(entries)).not.toContain(SECRET_TEXT);
  });

  it('логирует ошибку с кодом и пробрасывает её', async () => {
    const { logger, entries } = memoryLogger();
    const provider = new MockAiProvider({
      failWith: new AiProviderError('RATE_LIMITED', 'limit', { status: 429 }),
    });
    const service = new AiService({ provider, logger });
    await expect(
      service.chat({ messages: [{ role: 'user', content: 'a' }] }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    const failed = entries.find((e) => e.msg === 'ai.chat.failed');
    expect(failed?.meta).toMatchObject({ errorCode: 'RATE_LIMITED', errorStatus: 429 });
  });

  it('stream проксирует чанки и логирует итог', async () => {
    const { logger, entries } = memoryLogger();
    const provider = new MockAiProvider({ defaultResponse: 'раз два три' });
    const service = new AiService({ provider, logger });
    const texts: string[] = [];
    for await (const chunk of service.stream({ messages: [{ role: 'user', content: 'a' }] })) {
      if (chunk.type === 'token') texts.push(chunk.text);
    }
    expect(texts.join('')).toBe('раз два три');
    const done = entries.find((e) => e.msg === 'ai.stream.done');
    expect(done?.meta).toMatchObject({ streamedTokens: 3, streamedChars: 11 });
  });

  it('embed добавляет requestId и логирует размерность', async () => {
    const { logger, entries } = memoryLogger();
    const provider = new MockAiProvider();
    const service = new AiService({ provider, logger, generateRequestId: () => 'emb-1' });
    const res = await service.embed({ input: ['a', 'b'] });
    expect(res.vectors).toHaveLength(2);
    expect(provider.embedCalls[0]?.metadata?.requestId).toBe('emb-1');
    expect(entries.find((e) => e.msg === 'ai.embed.done')?.meta).toMatchObject({
      inputCount: 2,
      vectors: 2,
      dimensions: 8,
    });
  });

  it('chatJson использует один requestId на все попытки', async () => {
    const provider = new MockAiProvider({
      responses: [{ match: () => true, content: 'мусор', once: true }],
      defaultResponse: '{"ok": true}',
    });
    let counter = 0;
    const service = new AiService({ provider, generateRequestId: () => `req-${++counter}` });
    const result = await service.chatJson(
      { messages: [{ role: 'user', content: 'a' }] },
      z.object({ ok: z.boolean() }),
    );
    expect(result.data).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
    expect(provider.calls.map((c) => c.metadata?.requestId)).toEqual(['req-1', 'req-1']);
  });
});

describe('describeRequest', () => {
  it('не содержит текста сообщений', () => {
    const meta = describeRequest({
      messages: [{ role: 'user', content: SECRET_TEXT }],
      temperature: 0.2,
    });
    expect(JSON.stringify(meta)).not.toContain(SECRET_TEXT);
    expect(meta).toEqual({
      messageCount: 1,
      chars: SECRET_TEXT.length,
      charsByRole: { system: 0, user: SECRET_TEXT.length, assistant: 0 },
      temperature: 0.2,
    });
  });
});

describe('createAiProvider / aiConfigFromEnv', () => {
  it('mock по умолчанию', () => {
    const config = aiConfigFromEnv({});
    expect(config).toEqual({ provider: 'mock' });
    expect(createAiProvider(config)).toBeInstanceOf(MockAiProvider);
  });

  it('gigachat из env с пустыми строками как «не задано»', () => {
    const config = aiConfigFromEnv({
      AI_PROVIDER: 'gigachat',
      GIGACHAT_AUTH_KEY: 'a2V5',
      GIGACHAT_SCOPE: '',
      GIGACHAT_TIMEOUT_MS: '15000',
      GIGACHAT_MAX_RETRIES: '0',
      GIGACHAT_CA_CERT_PATH: '',
    });
    expect(config).toEqual({
      provider: 'gigachat',
      gigachat: { authKey: 'a2V5', timeoutMs: 15_000, maxRetries: 0 },
    });
    const provider = createAiProvider(config);
    expect(provider.name).toBe('gigachat');
  });

  it('gigachat без ключа — ошибка', () => {
    expect(() => createAiProvider({ provider: 'gigachat' })).toThrow(/GIGACHAT_AUTH_KEY/);
    expect(() => aiConfigFromEnv({ AI_PROVIDER: 'other' })).toThrow();
  });

  it('createAiService собирает сервис с провайдером', async () => {
    const service = createAiService({ provider: 'mock', mock: { defaultResponse: 'ok' } });
    expect(service.name).toBe('mock');
    expect((await service.chat({ messages: [{ role: 'user', content: 'a' }] })).content).toBe('ok');
  });
});
