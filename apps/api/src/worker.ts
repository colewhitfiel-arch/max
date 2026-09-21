import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/logger.service';
import { loadEnv } from './config/env';

/**
 * Worker-процесс: те же модули, что и api, но без HTTP. Выполняет фоновые задачи из очереди.
 * При QUEUE_DRIVER=inline не нужен (задачи выполняет сам api).
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env, 'worker'), {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLogger));
  app.enableShutdownHooks();
  await app.init();
  app
    .get(AppLogger)
    .child({ module: 'bootstrap' })
    .info({ queue: env.QUEUE_DRIVER }, 'worker запущен');
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
