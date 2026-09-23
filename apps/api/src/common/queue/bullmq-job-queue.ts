import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';
import { type EnqueueOptions, type JobHandler, type JobQueue, type QueueName } from './job-queue';

/**
 * Очередь на Redis (BullMQ). В режиме `api` только ставит задачи, в режиме `worker` — выполняет.
 * Требует REDIS_URL. Обработчики регистрируются так же, как в InlineJobQueue.
 */
export class BullMqJobQueue implements JobQueue {
  readonly driver = 'bullmq' as const;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly handlers = new Map<QueueName, Map<string, JobHandler>>();
  private readonly workers: Worker[] = [];
  private readonly connection: ConnectionOptions;

  constructor(
    redisUrl: string,
    private readonly mode: 'api' | 'worker',
    private readonly log: Logger,
  ) {
    const url = new URL(redisUrl);
    this.connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.pathname && url.pathname !== '/' ? { db: Number(url.pathname.slice(1)) } : {}),
    };
  }

  private queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue<T>(
    queue: QueueName,
    name: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<void> {
    await this.queue(queue).add(name, payload, {
      ...(options.delayMs ? { delay: options.delayMs } : {}),
      // Дедупликация только активных задач (waiting/delayed/active), как в InlineJobQueue.
      // Не jobId: BullMQ игнорирует повторный jobId и после завершения, пока job хранится
      // (removeOnComplete) — повторные пересчёты молча терялись бы.
      ...(options.jobId ? { deduplication: { id: options.jobId } } : {}),
      attempts: options.attempts ?? 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  process<T>(queue: QueueName, name: string, handler: JobHandler<T>): void {
    if (!this.handlers.has(queue)) this.handlers.set(queue, new Map());
    this.handlers.get(queue)!.set(name, handler as JobHandler);
  }

  async start(): Promise<void> {
    if (this.mode !== 'worker') return;
    for (const [queue, byName] of this.handlers) {
      const worker = new Worker(
        queue,
        async (job) => {
          const handler = byName.get(job.name);
          if (!handler) {
            this.log.warn({ queue, name: job.name }, 'нет обработчика для задачи');
            return;
          }
          await handler(job.data, { jobId: String(job.id), attempt: job.attemptsMade + 1 });
        },
        { connection: this.connection, concurrency: 5 },
      );
      worker.on('failed', (job, err) =>
        this.log.error({ queue, name: job?.name, jobId: job?.id, err }, 'ошибка фоновой задачи'),
      );
      this.workers.push(worker);
    }
    this.log.info({ queues: [...this.handlers.keys()] }, 'bullmq workers запущены');
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }
}
