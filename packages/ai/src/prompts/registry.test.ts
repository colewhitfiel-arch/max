import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { echoPrompt } from './examples/echo';
import { PromptRegistry, buildMessages, buildRequest, definePrompt } from './registry';

describe('definePrompt', () => {
  it('формирует key = id@version и замораживает объект', () => {
    expect(echoPrompt.key).toBe('example.echo@1');
    expect(Object.isFrozen(echoPrompt)).toBe(true);
  });

  it('валидирует id и версию', () => {
    expect(() => definePrompt({ id: 'Bad Id', version: 1, description: 'x', system: 's' })).toThrow(
      /id/,
    );
    expect(() => definePrompt({ id: 'ok', version: 0, description: 'x', system: 's' })).toThrow(
      /верси/,
    );
    expect(() => definePrompt({ id: 'ok', version: 1.5, description: 'x', system: 's' })).toThrow();
    expect(() => definePrompt({ id: 'ok', version: 1, description: 'x' })).toThrow(/system/);
  });
});

describe('buildMessages', () => {
  it('собирает system (строка/функция), историю и user', () => {
    const prompt = definePrompt({
      id: 'tutor.system',
      version: 2,
      description: 'x',
      system: (vars: { name: string }) => `Ученик: ${vars.name}`,
      user: (vars) => `Вопрос от ${vars.name}`,
    });
    const history = [{ role: 'assistant' as const, content: 'ранее' }];
    expect(buildMessages(prompt, { name: 'Маша' }, history)).toEqual([
      { role: 'system', content: 'Ученик: Маша' },
      { role: 'assistant', content: 'ранее' },
      { role: 'user', content: 'Вопрос от Маша' },
    ]);
    expect(buildMessages(echoPrompt, { text: 'hi' })).toEqual([
      { role: 'system', content: echoPrompt.system },
      { role: 'user', content: 'hi' },
    ]);
  });
});

describe('buildRequest', () => {
  it('проставляет promptId, json-формат при схеме и параметры промпта', () => {
    const req = buildRequest(echoPrompt, { text: 'hi' }, { metadata: { userId: 'u1' } });
    expect(req.metadata).toEqual({ promptId: 'example.echo@1', userId: 'u1' });
    expect(req.responseFormat).toBe('json');
    expect(req.temperature).toBe(0);
    expect(req.model).toBeUndefined();
    expect(req.messages).toHaveLength(2);
  });

  it('переопределения имеют приоритет', () => {
    const req = buildRequest(
      echoPrompt,
      { text: 'hi' },
      { model: 'GigaChat-Pro', temperature: 0.7, responseFormat: 'text' },
    );
    expect(req.model).toBe('GigaChat-Pro');
    expect(req.temperature).toBe(0.7);
    expect(req.responseFormat).toBe('text');
  });
});

describe('PromptRegistry', () => {
  it('register/get/find/has/list', () => {
    const registry = new PromptRegistry();
    const other = definePrompt({
      id: 'a.first',
      version: 1,
      description: 'x',
      system: 's',
      schema: z.object({}),
    });
    registry.register(echoPrompt);
    registry.register(other);
    expect(registry.get('example.echo@1')).toBe(echoPrompt);
    expect(registry.find('nope@1')).toBeUndefined();
    expect(registry.has('a.first@1')).toBe(true);
    expect(registry.list().map((p) => p.key)).toEqual(['a.first@1', 'example.echo@1']);
    expect(registry.size).toBe(2);
    expect(() => registry.get('nope@1')).toThrow(/не зарегистрирован/);
  });

  it('дубликат ключа — ошибка, разные версии — ок', () => {
    const registry = new PromptRegistry();
    registry.register(echoPrompt);
    expect(() => registry.register(echoPrompt)).toThrow(/уже зарегистрирован/);
    const v2 = definePrompt({ ...echoPrompt, version: 2 });
    registry.register(v2);
    expect(registry.size).toBe(2);
  });
});
