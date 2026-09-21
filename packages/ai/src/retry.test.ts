import { describe, expect, it, vi } from 'vitest';
import { computeBackoff, defaultShouldRetry, withRetry } from './retry';
import { AiProviderError } from './types';

const immediateSleep = vi.fn(async () => {});

describe('withRetry', () => {
  it('возвращает результат после успешного повтора', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new AiProviderError('UNAVAILABLE', 'down');
        return 'ok';
      },
      { maxRetries: 3, sleep: immediateSleep },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('бросает последнюю ошибку после исчерпания попыток', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new AiProviderError('RATE_LIMITED', `attempt ${calls}`);
        },
        { maxRetries: 2, sleep: immediateSleep },
      ),
    ).rejects.toThrow('attempt 3');
    expect(calls).toBe(3);
  });

  it('не повторяет non-retryable ошибки по умолчанию', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new AiProviderError('AUTH', 'bad key');
        },
        { maxRetries: 3, sleep: immediateSleep },
      ),
    ).rejects.toMatchObject({ code: 'AUTH' });
    expect(calls).toBe(1);
  });

  it('не повторяет обычные Error без shouldRetry', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('boom');
        },
        { sleep: immediateSleep },
      ),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  it('учитывает пользовательский shouldRetry', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return calls;
      },
      {
        shouldRetry: (err) => err instanceof Error && err.message === 'transient',
        sleep: immediateSleep,
      },
    );
    expect(result).toBe(2);
  });

  it('считает экспоненциальную задержку с джиттером и отдаёт её в onRetry', async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const onRetry = vi.fn();
    await expect(
      withRetry(async () => Promise.reject(new AiProviderError('NETWORK', 'x')), {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 350,
        random: () => 1,
        sleep,
        onRetry,
      }),
    ).rejects.toThrow();
    expect(delays).toEqual([100, 200, 350]);
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map((c) => c[0].attempt)).toEqual([1, 2, 3]);
    expect(onRetry.mock.calls.map((c) => c[0].delayMs)).toEqual([100, 200, 350]);
  });

  it('учитывает retryAfterMs из ошибки', async () => {
    const delays: number[] = [];
    await expect(
      withRetry(
        async () =>
          Promise.reject(new AiProviderError('RATE_LIMITED', 'slow', { retryAfterMs: 900 })),
        {
          maxRetries: 1,
          baseDelayMs: 100,
          maxDelayMs: 5000,
          random: () => 0,
          sleep: async (ms) => {
            delays.push(ms);
          },
        },
      ),
    ).rejects.toThrow();
    expect(delays).toEqual([900]);
  });

  it('прерывается по signal во время ожидания', async () => {
    const controller = new AbortController();
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls += 1;
        throw new AiProviderError('UNAVAILABLE', 'x');
      },
      { maxRetries: 5, baseDelayMs: 10_000, signal: controller.signal },
    );
    const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    setTimeout(() => controller.abort(), 1);
    await rejection;
    expect(calls).toBe(1);
  });

  it('не стартует при уже отменённом signal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const fn = vi.fn(async () => 'never');
    await expect(withRetry(fn, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('computeBackoff', () => {
  it('ограничен maxDelayMs и коэффициентом [0.5, 1]', () => {
    expect(computeBackoff(0, { baseDelayMs: 100, maxDelayMs: 1000, random: () => 0 })).toBe(50);
    expect(computeBackoff(0, { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 })).toBe(100);
    expect(computeBackoff(10, { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 })).toBe(1000);
  });
});

describe('defaultShouldRetry', () => {
  it('повторяет только retryable AiProviderError', () => {
    expect(defaultShouldRetry(new AiProviderError('TIMEOUT', 'x'))).toBe(true);
    expect(defaultShouldRetry(new AiProviderError('RATE_LIMITED', 'x'))).toBe(true);
    expect(defaultShouldRetry(new AiProviderError('NETWORK', 'x'))).toBe(true);
    expect(defaultShouldRetry(new AiProviderError('UNAVAILABLE', 'x'))).toBe(true);
    expect(defaultShouldRetry(new AiProviderError('AUTH', 'x'))).toBe(false);
    expect(defaultShouldRetry(new AiProviderError('INVALID_RESPONSE', 'x'))).toBe(false);
    expect(defaultShouldRetry(new AiProviderError('UNKNOWN', 'x'))).toBe(false);
    expect(defaultShouldRetry(new AiProviderError('AUTH', 'x', { retryable: true }))).toBe(true);
    expect(defaultShouldRetry(new DOMException('cancel', 'AbortError'))).toBe(false);
    expect(defaultShouldRetry(new Error('x'))).toBe(false);
  });
});
