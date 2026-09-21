import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@edu/db';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';

/** Единственный Prisma-клиент процесса. Модули получают его через DI и читают только свои таблицы. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@InjectEnv() env: Env) {
    super({
      datasources: { db: { url: env.DATABASE_URL } },
      log: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Проверка живости БД для /health. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
