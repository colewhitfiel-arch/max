import { abortReason, linkAbortSignal } from './abort';
import { AiProviderError } from './types';

export type TimeoutTask<T> = Promise<T> | ((signal: AbortSignal) => Promise<T>);

/**
 * Ограничивает выполнение по времени.
 *
 * - По истечении `ms` промис отклоняется `AiProviderError('TIMEOUT')`, а сигнал, переданный в `task`,
 *   отменяется с этой же ошибкой в качестве причины.
 * - Внешний `signal` объединяется с внутренним: его отмена завершает ожидание его же причиной.
 * - `ms <= 0` или не число — без таймаута (только проброс внешнего сигнала).
 */
export function withTimeout<T>(task: TimeoutTask<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  const controller = new AbortController();
  const unlink = linkAbortSignal(controller, signal);
  const hasTimeout = Number.isFinite(ms) && ms > 0;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
      once: true,
    });
    if (hasTimeout) {
      timer = setTimeout(() => {
        controller.abort(new AiProviderError('TIMEOUT', `Превышен таймаут ${ms} мс`));
      }, ms);
    }
  });

  const work = typeof task === 'function' ? task(controller.signal) : task;
  // Проигравшая гонку ветка не должна порождать unhandled rejection.
  work.catch(() => {});
  guard.catch(() => {});

  return Promise.race([work, guard]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    unlink();
  });
}
