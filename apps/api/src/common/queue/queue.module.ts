import {
  type DynamicModule,
  Global,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { type Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { AppLogger } from '../logger/logger.service';
import { BullMqJobQueue } from './bullmq-job-queue';
import { InlineJobQueue } from './inline-job-queue';
import { JOB_QUEUE, type JobQueue } from './job-queue';

export type ProcessMode = 'api' | 'worker';
export const PROCESS_MODE = Symbol('PROCESS_MODE');

class QueueLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(JOB_QUEUE) private readonly queue: JobQueue) {}
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.start();
  }
  async onApplicationShutdown(): Promise<void> {
    await this.queue.stop();
  }
}

/**
 * Фоновые задачи. `mode: 'api'` — HTTP-процесс (inline выполняет сам, bullmq только ставит),
 * `mode: 'worker'` — процесс worker.ts (bullmq выполняет).
 */
@Global()
@Module({})
export class QueueModule {
  static forRoot(mode: ProcessMode): DynamicModule {
    return {
      module: QueueModule,
      providers: [
        { provide: PROCESS_MODE, useValue: mode },
        {
          provide: JOB_QUEUE,
          inject: [ENV, AppLogger],
          useFactory: (env: Env, logger: AppLogger): JobQueue => {
            const log = logger.child({ module: 'queue' });
            if (env.QUEUE_DRIVER === 'bullmq' && env.REDIS_URL)
              return new BullMqJobQueue(env.REDIS_URL, mode, log);
            return new InlineJobQueue(log);
          },
        },
        QueueLifecycle,
      ],
      exports: [JOB_QUEUE, PROCESS_MODE],
    };
  }
}
