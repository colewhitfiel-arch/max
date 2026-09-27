import { Global, Module } from '@nestjs/common';
import { type Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { KV_STORE, type KeyValueStore, MemoryKeyValueStore } from './key-value-store';
import { PostgresKeyValueStore } from './postgres-key-value-store';

/** Выбор реализации по KV_DRIVER: memory (один процесс) или postgres (serverless, несколько инстансов). */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: KV_STORE,
      inject: [ENV, PrismaService],
      useFactory: (env: Env, prisma: PrismaService): KeyValueStore =>
        env.KV_DRIVER === 'postgres'
          ? new PostgresKeyValueStore(prisma)
          : new MemoryKeyValueStore(),
    },
  ],
  exports: [KV_STORE],
})
export class KvModule {}
