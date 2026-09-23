import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BullMqJobQueue } from '../../src/common/queue/bullmq-job-queue';

// vi.mock поднимается над импортами, поэтому мок доступен через vi.hoisted
const { add } = vi.hoisted(() => ({ add: vi.fn(async () => undefined) }));
vi.mock('bullmq', () => ({
  Queue: class {
    add = add;
    close = vi.fn(async () => undefined);
  },
  Worker: class {},
}));

describe('BullMqJobQueue', () => {
  beforeEach(() => add.mockClear());

  it('jobId — ключ дедупликации активных задач, а не постоянный id job-а', async () => {
    const queue = new BullMqJobQueue('redis://localhost:6379', 'api', pino({ level: 'silent' }));
    await queue.enqueue('ai', 'trajectory.build', { studentId: 's1' }, { jobId: 'trajectory-s1' });
    const [, , opts] = add.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    expect(opts.deduplication).toEqual({ id: 'trajectory-s1' });
    expect(opts.jobId).toBeUndefined();
  });

  it('без jobId дедупликации нет', async () => {
    const queue = new BullMqJobQueue('redis://localhost:6379', 'api', pino({ level: 'silent' }));
    await queue.enqueue('ai', 'x', {});
    const [, , opts] = add.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    expect(opts.deduplication).toBeUndefined();
  });
});
