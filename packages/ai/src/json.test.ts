import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { chatJson, extractJson, parseJsonResponse } from './json';
import { MockAiProvider } from './providers/mock';

describe('extractJson', () => {
  it('возвращает чистый JSON как есть', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
    expect(extractJson('  [1, 2] ')).toBe('[1, 2]');
  });

  it('вырезает из ```json-блока', () => {
    const text = 'Вот ответ:\n```json\n{"a": {"b": [1, 2]}}\n```\nГотово.';
    expect(extractJson(text)).toBe('{"a": {"b": [1, 2]}}');
  });

  it('вырезает из безымянного ```-блока', () => {
    expect(extractJson('```\n[1,2,3]\n```')).toBe('[1,2,3]');
  });

  it('находит первый сбалансированный объект в тексте', () => {
    expect(extractJson('Ответ: {"x": "a } b", "y": {"z": 1}} и ещё текст')).toBe(
      '{"x": "a } b", "y": {"z": 1}}',
    );
  });

  it('учитывает экранированные кавычки внутри строк', () => {
    expect(extractJson('{"s": "he said \\"}\\"" }')).toBe('{"s": "he said \\"}\\"" }');
  });

  it('возвращает скаляр, если весь текст — JSON', () => {
    expect(extractJson('42')).toBe('42');
    expect(extractJson('"str"')).toBe('"str"');
  });

  it('null, если JSON нет или он не закрыт', () => {
    expect(extractJson('просто текст')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('{"a": 1')).toBeNull();
  });
});

describe('parseJsonResponse', () => {
  const schema = z.object({ name: z.string(), age: z.number().int() });

  it('ok при валидном JSON по схеме', () => {
    expect(parseJsonResponse('```json\n{"name":"Маша","age":12}\n```', schema)).toEqual({
      ok: true,
      data: { name: 'Маша', age: 12 },
    });
  });

  it('ошибка, если JSON не найден', () => {
    const result = parseJsonResponse('нет данных', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('не найден');
  });

  it('ошибка при синтаксически невалидном JSON', () => {
    const result = parseJsonResponse('{"name": "x", "age": }', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Невалидный JSON/);
  });

  it('ошибка с путями полей при несоответствии схеме', () => {
    const result = parseJsonResponse('{"name": 1}', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('name');
      expect(result.error).toContain('age');
      expect(result.issues?.length).toBe(2);
    }
  });
});

describe('chatJson', () => {
  const schema = z.object({ answer: z.number() });

  it('возвращает данные с первой попытки', async () => {
    const provider = new MockAiProvider({ defaultResponse: '{"answer": 7}' });
    const result = await chatJson(provider, { messages: [{ role: 'user', content: 'q' }] }, schema);
    expect(result.data).toEqual({ answer: 7 });
    expect(result.attempts).toBe(1);
    expect(provider.calls[0]?.responseFormat).toBe('json');
  });

  it('повторяет запрос с текстом ошибки валидации', async () => {
    const provider = new MockAiProvider({
      responses: [
        { match: () => true, content: 'не JSON', once: true },
        { match: () => true, content: '{"answer": "строка"}', once: true },
      ],
      defaultResponse: '{"answer": 3}',
    });
    const result = await chatJson(provider, { messages: [{ role: 'user', content: 'q' }] }, schema);
    expect(result.data).toEqual({ answer: 3 });
    expect(result.attempts).toBe(3);
    expect(provider.calls).toHaveLength(3);

    const third = provider.calls[2]!;
    expect(third.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    expect(third.messages[1]?.content).toBe('не JSON');
    expect(third.messages[2]?.content).toContain('не найден JSON');
    expect(third.messages[4]?.content).toContain('answer');
  });

  it('бросает INVALID_RESPONSE после исчерпания попыток', async () => {
    const provider = new MockAiProvider({ defaultResponse: 'никакого json' });
    await expect(
      chatJson(provider, { messages: [{ role: 'user', content: 'q' }] }, schema, {
        maxRetries: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
    expect(provider.calls).toHaveLength(2);
  });

  it('пробрасывает ошибку провайдера без ретраев', async () => {
    const provider = new MockAiProvider({ failWith: new Error('down') });
    await expect(
      chatJson(provider, { messages: [{ role: 'user', content: 'q' }] }, schema),
    ).rejects.toThrow('down');
    expect(provider.calls).toHaveLength(1);
  });
});
