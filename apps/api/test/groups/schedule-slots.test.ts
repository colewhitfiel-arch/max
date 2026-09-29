/**
 * Материализация расписания без БД: слоты правила по часам школы (docs/04, groups + schedule)
 * и постановка job'а `schedule.materialize` раз в сутки.
 */
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyValueStore } from '../../src/common/kv/key-value-store';
import type { AppLogger } from '../../src/common/logger/logger.service';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import type { ProcessMode } from '../../src/common/queue/queue.module';
import {
  MATERIALIZE_WEEKS,
  type RuleForSlots,
  ruleSlots,
  type ScheduleMaterializerService,
} from '../../src/modules/groups/schedule-materializer.service';
import { ScheduleJobs, scheduleMarkKey } from '../../src/modules/groups/schedule.jobs';
import { testEnv } from '../helpers/env';

const rule = (overrides: Partial<RuleForSlots> = {}): RuleForSlots => ({
  id: 'rule-1',
  groupId: 'group-1',
  weekday: 1, // понедельник
  startTime: '15:00',
  endTime: '16:30',
  room: 'Каб. 12',
  validFrom: new Date('2026-09-01T00:00:00.000Z'),
  validTo: null,
  ...overrides,
});

const iso = (dates: Date[]) => dates.map((date) => date.toISOString());

describe('ruleSlots', () => {
  it('8 недель вперёд с сегодняшнего дня, время — по часам школы (МСК = UTC+3)', () => {
    const now = new Date('2026-09-28T09:00:00.000Z'); // понедельник, 12:00 МСК
    const slots = ruleSlots(rule(), 'Europe/Moscow', now);
    expect(slots).toHaveLength(MATERIALIZE_WEEKS);
    expect(slots[0]).toEqual({
      groupId: 'group-1',
      ruleId: 'rule-1',
      startsAt: new Date('2026-09-28T12:00:00.000Z'),
      endsAt: new Date('2026-09-28T13:30:00.000Z'),
      room: 'Каб. 12',
    });
    expect(slots.at(-1)?.startsAt.toISOString()).toBe('2026-11-16T12:00:00.000Z');
  });

  it('«сегодня» — по часам школы: в 01:30 МСК понедельника по UTC ещё воскресенье', () => {
    const now = new Date('2026-09-27T22:30:00.000Z');
    const slots = ruleSlots(rule(), 'Europe/Moscow', now);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-09-28T12:00:00.000Z');
  });

  it('validFrom и validTo ограничивают слоты (обе даты включительно)', () => {
    const now = new Date('2026-09-28T09:00:00.000Z');
    const slots = ruleSlots(
      rule({
        validFrom: new Date('2026-10-12T00:00:00.000Z'),
        validTo: new Date('2026-10-19T00:00:00.000Z'),
      }),
      'Europe/Moscow',
      now,
    );
    expect(iso(slots.map((slot) => slot.startsAt))).toEqual([
      '2026-10-12T12:00:00.000Z',
      '2026-10-19T12:00:00.000Z',
    ]);
    expect(ruleSlots(rule({ validTo: new Date('2026-09-27T00:00:00.000Z') }), 'UTC', now)).toEqual(
      [],
    );
  });

  it('переход на зимнее время не сдвигает занятие по местным часам', () => {
    // America/New_York: 1 ноября 2026 — конец летнего времени (UTC−4 → UTC−5)
    const now = new Date('2026-10-24T12:00:00.000Z');
    const slots = ruleSlots(
      rule({ weekday: 0, startTime: '10:00', endTime: '11:00' }),
      'America/New_York',
      now,
      2,
    );
    expect(iso(slots.map((slot) => slot.startsAt))).toEqual([
      '2026-10-25T14:00:00.000Z',
      '2026-11-01T15:00:00.000Z',
    ]);
  });

  it('правило с концом не позже начала слотов не даёт', () => {
    const now = new Date('2026-09-28T09:00:00.000Z');
    expect(ruleSlots(rule({ endTime: '15:00' }), 'Europe/Moscow', now)).toEqual([]);
    expect(ruleSlots(rule({ startTime: '25:00' }), 'Europe/Moscow', now)).toEqual([]);
  });
});

describe('ScheduleJobs: job schedule.materialize раз в сутки', () => {
  const silent = pino({ level: 'silent' });
  const logger = { child: () => silent } as unknown as AppLogger;

  function setup(options: { mode?: ProcessMode; nodeEnv?: 'development' | 'test' } = {}) {
    const queue = new InlineJobQueue(silent);
    const kv = new MemoryKeyValueStore();
    const materialize = vi.fn(async () => ({ created: 0 }));
    const jobs = new ScheduleJobs(
      queue,
      kv,
      options.mode ?? 'api',
      testEnv({ NODE_ENV: options.nodeEnv ?? 'development' }),
      { materialize } as unknown as ScheduleMaterializerService,
      logger,
    );
    jobs.onModuleInit();
    return { queue, kv, materialize, jobs };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('повторная проверка в те же сутки (холодный старт) ничего не ставит, на следующие — ставит', async () => {
    const { queue, materialize, jobs } = setup();
    const day = new Date('2026-09-28T09:00:00.000Z');
    expect(await jobs.enqueueDaily(day)).toBe(true);
    expect(await jobs.enqueueDaily(new Date('2026-09-28T20:00:00.000Z'))).toBe(false);
    await queue.drain();
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(await jobs.enqueueDaily(new Date('2026-09-29T00:10:00.000Z'))).toBe(true);
    await queue.drain();
    expect(materialize).toHaveBeenCalledTimes(2);
  });

  it('сбой материализации снимает отметку: следующая проверка повторяет', async () => {
    const { queue, kv, materialize, jobs } = setup();
    materialize.mockRejectedValueOnce(new Error('db down'));
    const day = new Date('2026-09-28T09:00:00.000Z');
    expect(await jobs.enqueueDaily(day)).toBe(true);
    await queue.drain();
    expect(await kv.get(scheduleMarkKey(day))).toBeUndefined();
    expect(await jobs.enqueueDaily(day)).toBe(true);
    await queue.drain();
    expect(materialize).toHaveBeenCalledTimes(2);
  });

  it('старт api ставит job и проверяет раз в час; worker и тесты сами не ставят', async () => {
    vi.useFakeTimers({
      now: new Date('2026-09-28T09:00:00.000Z'),
      toFake: ['setInterval', 'Date'],
    });
    for (const options of [{ mode: 'worker' as const }, { nodeEnv: 'test' as const }]) {
      const { queue, materialize, jobs } = setup(options);
      await jobs.onApplicationBootstrap();
      await queue.drain();
      expect(materialize).not.toHaveBeenCalled();
      jobs.onApplicationShutdown();
    }

    const { queue, kv, materialize, jobs } = setup();
    await jobs.onApplicationBootstrap();
    await vi.waitFor(() => expect(materialize).toHaveBeenCalledTimes(1));
    expect(await kv.get(scheduleMarkKey(new Date()))).toBe(1);
    // через час те же сутки — не повторяет; через сутки — ставит снова
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await queue.drain();
    expect(materialize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    await vi.waitFor(() => expect(materialize).toHaveBeenCalledTimes(2));
    jobs.onApplicationShutdown();
  });
});
