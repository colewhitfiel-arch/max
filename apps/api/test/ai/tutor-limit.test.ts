/**
 * Дневной лимит тьютора (AI_TUTOR_DAILY_LIMIT): попытка резервируется атомарно до вызова модели,
 * поэтому параллельные сообщения не проходят сверх лимита; несостоявшийся ход резерв возвращает.
 * Без БД: репозиторий и модель — заглушки, KV — MemoryKeyValueStore.
 */
import { type AiService, type AiStreamChunk, tutorPrompt } from '@edu/ai';
import type { AiConversation } from '@edu/db';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import type { DomainEventBus } from '../../src/common/events/domain-events';
import { MemoryKeyValueStore } from '../../src/common/kv/key-value-store';
import type { AppLogger } from '../../src/common/logger/logger.service';
import type { AiRepository } from '../../src/modules/ai/ai.repository';
import type { StudentContextBuilder } from '../../src/modules/ai/context-builder';
import type { SseSink } from '../../src/modules/ai/sse';
import { TutorService, type TutorTurn } from '../../src/modules/ai/tutor.service';
import { testEnv } from '../helpers/env';

type Script = () => AsyncGenerator<AiStreamChunk>;

const answered: Script = async function* () {
  await new Promise((r) => setTimeout(r, 10));
  yield { type: 'token', text: 'Ответ' };
};
const unavailable: Script = async function* () {
  yield { type: 'error', error: { code: 'UNAVAILABLE', message: 'нет связи' } } as AiStreamChunk;
};

function setup(limit: number) {
  const kv = new MemoryKeyValueStore();
  let script: Script = answered;
  const ai = { stream: () => script() } as unknown as AiService;
  const repo = {
    recentMessages: async () => [],
    addMessage: async () => ({ id: 'message-id' }),
  } as unknown as AiRepository;
  const logger = { child: () => pino({ level: 'silent' }) } as unknown as AppLogger;
  const service = new TutorService(
    repo,
    {} as StudentContextBuilder,
    ai,
    { emit: async () => undefined } as unknown as DomainEventBus,
    kv,
    testEnv({ AI_TUTOR_DAILY_LIMIT: String(limit) }),
    logger,
  );
  const turn = (signal = new AbortController().signal): TutorTurn<{ context: string }> => ({
    userId: 'user-1',
    conversation: { id: 'conversation-1' } as AiConversation,
    text: 'Вопрос',
    sink: { write: () => undefined, end: () => undefined, signal, opened: false } as SseSink,
    prompt: tutorPrompt,
    vars: async () => ({ context: 'нет данных' }),
    unavailableMessage: 'недоступно',
  });
  return { service, turn, setScript: (next: Script) => (script = next) };
}

describe('TutorService: дневной лимит', () => {
  it('параллельные сообщения не проходят сверх лимита', async () => {
    const { service, turn } = setup(2);
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => service.runTurn(turn())));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toMatchObject({ code: 'RATE_LIMITED' });
    // Отказы резерв не съели: лимит исчерпан ровно двумя ответами
    await expect(service.runTurn(turn())).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('сбой модели, ошибка и уход клиента до ответа лимит не тратят', async () => {
    const { service, turn, setScript } = setup(1);
    setScript(unavailable);
    expect(await service.runTurn(turn())).toEqual({ chars: 0, failed: true });

    setScript(async function* () {
      yield* [];
      throw new Error('обрыв');
    });
    await expect(service.runTurn(turn())).rejects.toThrow('обрыв');

    const aborted = new AbortController();
    aborted.abort();
    setScript(async function* () {
      yield* [];
    });
    expect(await service.runTurn(turn(aborted.signal))).toBeNull();

    // Попытка всё ещё есть — и она последняя
    setScript(answered);
    expect(await service.runTurn(turn())).toEqual({ chars: 5, failed: false });
    await expect(service.runTurn(turn())).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
