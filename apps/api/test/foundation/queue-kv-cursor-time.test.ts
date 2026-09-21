import pino from 'pino';
import { describe, expect, it } from 'vitest';
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
