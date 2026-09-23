export const JOB_QUEUE = Symbol('JOB_QUEUE');

export const QUEUE_NAMES = [
  'analytics',
  'ai',
  'course-builder',
  'notifications',
  'schedule',
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export interface EnqueueOptions {
  /** Задержка перед выполнением. */
  delayMs?: number;
  /**
   * Ключ дедупликации: повторная постановка с тем же id игнорируется, пока предыдущая задача
   * ждёт или выполняется. После её завершения (успех/сбой) та же постановка снова ставится.
   */
  jobId?: string;
  attempts?: number;
}

export type JobHandler<T = unknown> = (
  payload: T,
  meta: { jobId: string; attempt: number },
) => Promise<void>;

/**
 * Порт фоновых задач. Реализации: InlineJobQueue (в процессе, dev без Redis) и BullMqJobQueue (Redis).
 * Модули регистрируют обработчики в `*.jobs.ts` через `process()`; обработчики идемпотентны.
 */
export interface JobQueue {
  readonly driver: 'inline' | 'bullmq';
  enqueue<T>(queue: QueueName, name: string, payload: T, options?: EnqueueOptions): Promise<void>;
  process<T>(queue: QueueName, name: string, handler: JobHandler<T>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
