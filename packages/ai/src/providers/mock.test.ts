import { describe, expect, it } from 'vitest';
import type { AiChatRequest, AiStreamChunk } from '../types';
import { AiProviderError } from '../types';
import { MOCK_EMBEDDING_DIMENSIONS, MockAiProvider, hashVector, tokenize } from './mock';

const ask = (content: string, extra: Partial<AiChatRequest> = {}): AiChatRequest => ({
  messages: [
    { role: 'system', content: 'sys' },
    { role: 'user', content },
  ],
  ...extra,
});

async function collect(iterable: AsyncIterable<AiStreamChunk>): Promise<AiStreamChunk[]> {
  const chunks: AiStreamChunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe('MockAiProvider.chat', () => {
  it('по умолчанию — эхо последнего user-сообщения', async () => {
    const provider = new MockAiProvider();
    const res = await provider.chat(ask('привет'));
    expect(res.content).toBe('[mock] привет');
    expect(res.model).toBe('mock-chat');
    expect(res.usage?.totalTokens).toBeGreaterThan(0);
    expect(provider.calls).toHaveLength(1);
  });

  it('responseFormat json без совпадений → {}', async () => {
    const provider = new MockAiProvider();
    const res = await provider.chat(ask('привет', { responseFormat: 'json' }));
    expect(res.content).toBe('{}');
  });

  it('матчит по строке, RegExp и функции; первое совпадение побеждает', async () => {
    const provider = new MockAiProvider({
      responses: [
        { match: 'погода', content: 'солнечно' },
        { match: /^сколько/i, content: (req) => `запрос: ${req.messages.at(-1)?.content}` },
        { match: (req) => req.metadata?.promptId === 'x@1', content: 'по promptId' },
      ],
    });
    expect((await provider.chat(ask('какая погода?'))).content).toBe('солнечно');
    expect((await provider.chat(ask('Сколько будет 2+2'))).content).toBe(
      'запрос: Сколько будет 2+2',
    );
    expect(
      (await provider.chat(ask('что угодно', { metadata: { promptId: 'x@1' } }))).content,
    ).toBe('по promptId');
    expect((await provider.chat(ask('ничего'))).content).toBe('[mock] ничего');
  });

  it('once-правило срабатывает один раз', async () => {
    const provider = new MockAiProvider({
      responses: [{ match: () => true, content: 'первый', once: true }],
      defaultResponse: 'дальше',
    });
    expect((await provider.chat(ask('a'))).content).toBe('первый');
    expect((await provider.chat(ask('a'))).content).toBe('дальше');
  });

  it('failWith бросает ошибку; функция может решать по вызову', async () => {
    const error = new AiProviderError('UNAVAILABLE', 'down');
    const always = new MockAiProvider({ failWith: error });
    await expect(always.chat(ask('a'))).rejects.toBe(error);

    const flaky = new MockAiProvider({
      failWith: (_req, index) => (index === 0 ? error : undefined),
    });
    await expect(flaky.chat(ask('a'))).rejects.toBe(error);
    await expect(flaky.chat(ask('a'))).resolves.toMatchObject({ content: '[mock] a' });
  });

  it('delayMs учитывает signal', async () => {
    const provider = new MockAiProvider({ delayMs: 10_000 });
    const controller = new AbortController();
    const promise = provider.chat(ask('a', { signal: controller.signal }));
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('MockAiProvider.stream', () => {
  it('режет ответ на токены по словам и завершает done', async () => {
    const provider = new MockAiProvider({ defaultResponse: 'раз два  три' });
    const chunks = await collect(provider.stream(ask('a')));
    const tokens = chunks.filter((c) => c.type === 'token').map((c) => c.text);
    expect(tokens).toEqual(['раз ', 'два  ', 'три']);
    expect(tokens.join('')).toBe('раз два  три');
    expect(chunks.at(-1)).toMatchObject({ type: 'done', response: { content: 'раз два  три' } });
  });

  it('ошибка приходит чанком error', async () => {
    const provider = new MockAiProvider({ failWith: new AiProviderError('RATE_LIMITED', 'x') });
    const chunks = await collect(provider.stream(ask('a')));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'error', error: { code: 'RATE_LIMITED' } });
  });
});

describe('MockAiProvider.embed', () => {
  it('детерминированные векторы размерности 8', async () => {
    const provider = new MockAiProvider();
    const a = await provider.embed({ input: ['робототехника', 'рисование'] });
    const b = await provider.embed({ input: ['робототехника'] });
    expect(a.vectors).toHaveLength(2);
    expect(a.vectors[0]).toHaveLength(MOCK_EMBEDDING_DIMENSIONS);
    expect(a.vectors[0]).toEqual(b.vectors[0]);
    expect(a.vectors[0]).not.toEqual(a.vectors[1]);
    expect(a.model).toBe('mock-embeddings');
    expect(provider.embedCalls).toHaveLength(2);
  });

  it('векторы нормированы', () => {
    const v = hashVector('текст', 8);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe('tokenize', () => {
  it('сохраняет пробелы и переводы строк', () => {
    expect(tokenize('a b\nc')).toEqual(['a ', 'b\n', 'c']);
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual(['   ']);
  });
});
