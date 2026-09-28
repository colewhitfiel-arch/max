import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TsRestModule } from '@ts-rest/nest';
import { AuthCoreModule } from './common/auth/auth.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { DomainEventsModule } from './common/events/domain-events.module';
import { KvModule } from './common/kv/kv.module';
import { HttpLoggingInterceptor } from './common/logger/http-logging.interceptor';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import {
  type ProcessMode,
  QueueModule,
  type QueueModuleOptions,
} from './common/queue/queue.module';
import { type Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DOMAIN_MODULES } from './modules';

export type AppModuleOptions = QueueModuleOptions;

/**
 * Корневой модуль. Один и тот же для HTTP-процесса (mode='api'), worker'а (mode='worker')
 * и serverless-функции (vercel.ts): различается только поведение очереди.
 * Доменные модули — в modules/index.ts.
 */
@Module({})
export class AppModule {
  static forRoot(
    env: Env,
    mode: ProcessMode = 'api',
    options: AppModuleOptions = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        LoggerModule,
        PrismaModule,
        DomainEventsModule,
        KvModule,
        QueueModule.forRoot(mode, options),
        AuthCoreModule,
        TsRestModule.register({
          isGlobal: true,
          // Клиент (shared/api/client.ts) шлёт query обычными строками, схемы контрактов — строки
          // и z.coerce. jsonQuery разбирал бы «true»/«7» в boolean/number и ронял валидацию в 400.
          jsonQuery: false,
          validateResponses: env.APP_ENV !== 'production',
        }),
        ...DOMAIN_MODULES,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
      ],
    };
  }
}
