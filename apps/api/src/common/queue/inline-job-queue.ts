import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { type EnqueueOptions, type JobHandler, type JobQueue, type QueueName } from './job-queue';

export interface InlineJobQueueOptions {
  /**
   * Куда отдать промис фоновой задачи, чтобы среда дождалась его после ответа клиенту
   * (Vercel: `waitUntil` из `@vercel/functions`). В обычном процессе не нужен.
   */
  keepAlive?: (task: Promise<unknown>) => void;
}

/**
 * Очередь «в процессе»: задачи выполняются асинхронно в том же процессе после ответа клиенту.
 * Для dev/test без Redis и для inline-режима api. Не переживает рестарт — это осознанно.
 */
export class InlineJobQueue implements JobQueue {
  readonly driver = 'inline' as const;
  private readonly handlers = new Map<string, JobHandler>();
  private readonly pending = new Set<Promise<void>>();
  private readonly activeIds = new Set<string>();
  private stopped = false;

  constructor(
    private readonly log: Logger,
    private readonly options: InlineJobQueueOptions = {},
  ) {}

  process<T>(queue: QueueName, name: string, handler: JobHandler<T>): void {
    this.handlers.set(`${queue}:${name}`, handler as JobHandler);
  }

  async enqueue<T>(
    queue: QueueName,
    name: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<void> {
    if (this.stopped) return;
    const key = `${queue}:${name}`;
    const handler = this.handlers.get(key);
    if (!handler) {
      this.log.warn({ queue, name }, 'нет обработчика для задачи — пропущена');
      return;
    }
    const jobId = options.jobId ?? randomUUID();
    const dedupeKey = `${key}:${jobId}`;
    if (options.jobId && this.activeIds.has(dedupeKey)) return;
    this.activeIds.add(dedupeKey);

    const run = async () => {
      // Всегда асинхронно: обработчик стартует после ответа клиенту, не внутри вызова enqueue
      await new Promise((r) => setTimeout(r, options.delayMs ?? 0));
      const attempts = Math.max(1, options.attempts ?? 1);
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await handler(payload, { jobId, attempt });
          return;
        } catch (err) {
          this.log.error({ queue, name, jobId, attempt, err }, 'ошибка фоновой задачи');
          if (attempt === attempts) return;
        }
      }
    };
    const p = run().finally(() => {
      this.pending.delete(p);
      this.activeIds.delete(dedupeKey);
    });
    this.pending.add(p);
    // Serverless: не дать платформе заморозить инстанс, пока задача не доработала
    this.options.keepAlive?.(p);
  }

  async start(): Promise<void> {
    this.stopped = false;
  }

  /** Дожидается завершения активных задач (полезно в тестах). */
  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled([...this.pending]);
  }

  /** Для тестов: дождаться всех поставленных задач. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
