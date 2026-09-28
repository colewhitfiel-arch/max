import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { AppLogger } from '../../common/logger/logger.service';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { PROCESS_MODE, type ProcessMode } from '../../common/queue/queue.module';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { ScheduleMaterializerService } from './schedule-materializer.service';

export const SCHEDULE_MATERIALIZE_JOB = 'schedule.materialize';
/** Как часто долгоживущий процесс проверяет, пора ли материализовать (сам запуск — раз в сутки). */
export const SCHEDULE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Отметка «сегодня уже материализовали» живёт чуть дольше суток. */
const MARK_TTL_SEC = 26 * 60 * 60;

/** Ключ KV: одна материализация на сутки (дата UTC) на все процессы и инстансы. */
export const scheduleMarkKey = (now: Date) =>
  `schedule:materialized:${now.toISOString().slice(0, 10)}`;

/**
 * Очередь `schedule`: job `schedule.materialize` (docs/04). Ставит его HTTP-процесс (`mode: 'api'`,
 * в том числе функция Vercel) — при старте и затем раз в сутки. Выполняет тот, кто выполняет
 * очередь: inline — сам api, bullmq — worker. Отметка в KV (`KeyValueStore`, на Vercel — Postgres)
 * не даёт холодным стартам и соседним инстансам повторять материализацию в те же сутки; при сбое
 * она снимается, чтобы следующая проверка повторила попытку. В тестах (`NODE_ENV=test`) сам
 * не запускается — тесты вызывают сервис напрямую.
 */
@Injectable()
export class ScheduleJobs implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    @Inject(PROCESS_MODE) private readonly mode: ProcessMode,
    @InjectEnv() private readonly env: Env,
    private readonly materializer: ScheduleMaterializerService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'schedule' });
  }

  onModuleInit(): void {
    this.queue.process<{ markKey: string }>(
      'schedule',
      SCHEDULE_MATERIALIZE_JOB,
      async (payload) => {
        try {
          await this.materializer.materialize();
        } catch (error) {
          await this.kv.del(payload.markKey).catch(() => undefined);
          throw error;
        }
      },
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.mode !== 'api' || this.env.NODE_ENV === 'test') return;
    await this.enqueueDaily();
    this.timer = setInterval(() => void this.enqueueDaily(), SCHEDULE_CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Ставит материализацию, если сегодня её ещё не ставили. `true` — поставлена. */
  async enqueueDaily(now: Date = new Date()): Promise<boolean> {
    const markKey = scheduleMarkKey(now);
    try {
      if ((await this.kv.incr(markKey, MARK_TTL_SEC)) > 1) return false;
      await this.queue.enqueue(
        'schedule',
        SCHEDULE_MATERIALIZE_JOB,
        { markKey },
        // Одна попытка: при сбое отметка снимается, и повтор делает следующая проверка.
        { jobId: markKey, attempts: 1 },
      );
      return true;
    } catch (error) {
      // Недоступная БД/Redis не должна ронять старт api: следующая проверка попробует снова.
      this.log.error({ err: error }, 'не удалось поставить материализацию расписания');
      await this.kv.del(markKey).catch(() => undefined);
      return false;
    }
  }
}
