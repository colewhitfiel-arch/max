import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MemoryKeyValueStore } from '../../src/common/kv/key-value-store';
import {
  decodeCursor,
  encodeCursor,
  normalizeLimit,
  toPage,
} from '../../src/common/pagination/cursor';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { dayBounds, toDateOnly, tzOffsetMinutes } from '../../src/common/time/time';

const silent = pino({ level: 'silent' });

describe('InlineJobQueue', () => {
  it('выполняет задачу асинхронно и дедуплицирует по jobId', async () => {
    const q = new InlineJobQueue(silent);
    const calls: unknown[] = [];
    q.process<{ n: number }>('analytics', 'recalc', async (p) => {
      calls.push(p.n);
    });
    await q.enqueue('analytics', 'recalc', { n: 1 }, { jobId: 'a' });
    await q.enqueue('analytics', 'recalc', { n: 2 }, { jobId: 'a' });
    await q.enqueue('analytics', 'recalc', { n: 3 });
    expect(calls).toEqual([]);
    await q.drain();
    expect(calls.sort()).toEqual([1, 3]);
  });

  it('ошибка обработчика не роняет процесс и ретраится по attempts', async () => {
    const q = new InlineJobQueue(silent);
    let attempts = 0;
    q.process('ai', 'fail', async () => {
      attempts += 1;
      throw new Error('boom');
    });
    await q.enqueue('ai', 'fail', {}, { attempts: 2 });
    await q.drain();
    expect(attempts).toBe(2);
  });

  it('keepAlive получает промис задачи и дожидается её завершения (serverless)', async () => {
    const kept: Promise<unknown>[] = [];
    const q = new InlineJobQueue(silent, { keepAlive: (p) => kept.push(p) });
    let done = false;
    q.process('course-builder', 'generate', async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    await q.enqueue('course-builder', 'generate', {}, { jobId: 'j1' });
    expect(kept).toHaveLength(1);
    expect(done).toBe(false);
    await kept[0];
    expect(done).toBe(true);
  });
});

describe('MemoryKeyValueStore', () => {
  it('TTL и incr', async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set('k', { a: 1 }, 60);
    expect(await kv.get('k')).toEqual({ a: 1 });
    expect(await kv.incr('cnt', 60)).toBe(1);
    expect(await kv.incr('cnt', 60)).toBe(2);
    await kv.set('exp', 1, -1);
    expect(await kv.get('exp')).toBeUndefined();
  });

  it('setIfAbsent занимает ключ один раз; протухший — можно занять заново', async () => {
    const kv = new MemoryKeyValueStore();
    const claims = await Promise.all([1, 2, 3].map((n) => kv.setIfAbsent('claim', n, 60)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await kv.setIfAbsent('claim', 'другое', 60)).toBe(false);
    await kv.set('old', 'x', -1);
    expect(await kv.setIfAbsent('old', 'y', 60)).toBe(true);
    expect(await kv.get('old')).toBe('y');
  });

  it('decr возвращает попытку живому счётчику, не создаёт ключ и не уходит ниже нуля', async () => {
    const kv = new MemoryKeyValueStore();
    expect(await kv.decr('none')).toBe(0);
    expect(await kv.get('none')).toBeUndefined();
    await kv.incr('cnt', 60);
    await kv.incr('cnt', 60);
    expect(await kv.decr('cnt')).toBe(1);
    expect(await kv.decr('cnt')).toBe(0);
    expect(await kv.decr('cnt')).toBe(0);
    expect(await kv.incr('cnt', 60)).toBe(1);
  });

  it('протухшие ключи, которые больше не читают, запись убирает не чаще раза в минуту', async () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const kv = new MemoryKeyValueStore();
      // Счётчики rate-limit одного окна: после него их ключи никто не читает
      for (let user = 0; user < 50; user += 1) await kv.incr(`rl:ai:user:${user}:0`, 60);
      await kv.set('forever', 1);
      await kv.set('long', 1, 3600);
      expect(kv.size).toBe(52);

      vi.setSystemTime(59_000);
      await kv.incr('rl:ai:user:0:0', 60);
      expect(kv.size).toBe(52);

      vi.setSystemTime(61_000);
      await kv.incr('rl:ai:user:0:1', 60);
      expect(kv.size).toBe(3);
      expect(await kv.get('forever')).toBe(1);
      expect(await kv.get('long')).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cursor pagination', () => {
  it('encode/decode round-trip и toPage', () => {
    const cursor = encodeCursor({ id: 'x', at: '2026-01-01' });
    expect(decodeCursor(cursor)).toEqual({ id: 'x', at: '2026-01-01' });
    expect(() => decodeCursor('***')).toThrow();
    expect(normalizeLimit(undefined)).toBe(20);
    expect(normalizeLimit(1000)).toBe(100);
    const page = toPage([1, 2, 3], 2, (last) => ({ last }));
    expect(page.items).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor)).toEqual({ last: 2 });
    expect(toPage([1], 2, (l) => ({ l })).nextCursor).toBeUndefined();
  });

  it('схема курсора: чужая форма → VALIDATION, а не Invalid Date в Prisma', () => {
    const schema = z.object({ createdAt: z.string().datetime(), id: z.string() });
    const good = encodeCursor({ createdAt: '2026-01-01T00:00:00.000Z', id: 'a' });
    expect(decodeCursor(good, schema)).toEqual({ createdAt: '2026-01-01T00:00:00.000Z', id: 'a' });
    expect(() => decodeCursor(encodeCursor({ x: 1 }), schema)).toThrow(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });
});

describe('time', () => {
  it('смещение и границы дня в зоне школы', () => {
    const at = new Date('2026-09-21T10:00:00.000Z');
    expect(tzOffsetMinutes('Europe/Moscow', at)).toBe(180);
    const { start, end } = dayBounds('Europe/Moscow', at);
    expect(start.toISOString()).toBe('2026-09-20T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-21T21:00:00.000Z');
    expect(toDateOnly('Europe/Moscow', new Date('2026-09-21T22:30:00.000Z'))).toBe('2026-09-22');
  });
});
