import { abortReason } from './abort';

/**
 * Счётный семафор для ограничения одновременных запросов к провайдеру.
 * Персональный тариф GigaChat принимает один запрос за раз (иначе 429), поэтому
 * параллельность пайплайнов упирается сюда, а не в ретраи.
 */
export class Semaphore {
  private active = 0;
  private readonly queue: Array<{ resolve: () => void }> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Semaphore: limit должен быть ≥ 1');
  }

  get inFlight(): number {
    return this.active;
  }

  get waiting(): number {
    return this.queue.length;
  }

  /** Занимает слот; возвращает функцию освобождения (идемпотентна). Отмена в очереди — reject причиной сигнала. */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw abortReason(signal);
    if (this.active < this.limit) {
      this.active += 1;
      return this.releaser();
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) this.queue.splice(index, 1);
        reject(abortReason(signal as AbortSignal));
      };
      const entry = {
        resolve: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(entry);
    });
    this.active += 1;
    return this.releaser();
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const next = this.queue.shift();
      next?.resolve();
    };
  }
}
