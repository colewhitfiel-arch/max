import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppLogger } from './common/logger/logger.service';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule.forRoot(env, 'api'), { bufferLogs: true });
  configureApp(app, env);
  await app.listen(env.API_PORT);
  app.get(AppLogger).child({ module: 'bootstrap' }).info(
    {
      port: env.API_PORT,
      appEnv: env.APP_ENV,
      auth: env.AUTH_PROVIDER,
      ai: env.AI_PROVIDER,
      queue: env.QUEUE_DRIVER,
      storage: env.STORAGE_DRIVER,
    },
    `api запущен: ${env.API_URL}/api/v1`,
  );
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
