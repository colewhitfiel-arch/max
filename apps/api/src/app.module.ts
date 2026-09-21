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
import { type ProcessMode, QueueModule } from './common/queue/queue.module';
import { type Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DOMAIN_MODULES } from './modules';

/**
 * Корневой модуль. Один и тот же для HTTP-процесса (mode='api') и worker'а (mode='worker'):
 * различается только поведение очереди. Доменные модули — в modules/index.ts.
 */
@Module({})
export class AppModule {
  static forRoot(env: Env, mode: ProcessMode = 'api'): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        LoggerModule,
        PrismaModule,
        DomainEventsModule,
        KvModule,
        QueueModule.forRoot(mode),
        AuthCoreModule,
        TsRestModule.register({
          isGlobal: true,
          jsonQuery: true,
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
