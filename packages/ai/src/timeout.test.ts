import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './timeout';
import { AiProviderError } from './types';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('возвращает результат, если задача успела', async () => {
    const promise = withTimeout(
      (signal) =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve(signal.aborted ? 'aborted' : 'ok'), 10),
        ),
      100,
    );
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBe('ok');
  });

  it('бросает AiProviderError TIMEOUT и отменяет сигнал задачи', async () => {
    let taskSignal: AbortSignal | undefined;
    const promise = withTimeout((signal) => {
      taskSignal = signal;
      return new Promise<never>(() => {});
    }, 50);
    const rejection = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(taskSignal?.aborted).toBe(true);
    expect(taskSignal?.reason).toBeInstanceOf(AiProviderError);
  });

  it('принимает готовый промис', async () => {
    const promise = withTimeout(Promise.resolve(42), 100);
    await expect(promise).resolves.toBe(42);
  });

  it('пробрасывает причину внешней отмены', async () => {
    const controller = new AbortController();
    let taskSignal: AbortSignal | undefined;
    const promise = withTimeout(
      (signal) => {
        taskSignal = signal;
        return new Promise<never>(() => {});
      },
      1000,
      controller.signal,
    );
    const rejection = expect(promise).rejects.toThrow('user cancelled');
    controller.abort(new Error('user cancelled'));
    await rejection;
    expect(taskSignal?.aborted).toBe(true);
  });

  it('сразу отклоняется при уже отменённом сигнале', async () => {
    const controller = new AbortController();
    controller.abort();
    const task = vi.fn(() => Promise.resolve('never'));
    await expect(withTimeout(task, 100, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(task).not.toHaveBeenCalled();
  });

  it('ms <= 0 — без таймаута', async () => {
    const promise = withTimeout(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 10_000)),
      0,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toBe('late');
  });

  it('ошибка задачи пробрасывается как есть', async () => {
    await expect(withTimeout(() => Promise.reject(new Error('inner')), 100)).rejects.toThrow(
      'inner',
    );
  });
});
