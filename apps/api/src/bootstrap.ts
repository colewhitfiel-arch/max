import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@edu/contracts';
import { AppLogger } from './common/logger/logger.service';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/logger/request-id.middleware';
import { type Env } from './config/env';

/** Общая настройка HTTP-приложения для main.ts и тестов: префикс, CORS, request-id, логгер. */
export function configureApp(app: INestApplication, env: Env): void {
  app.useLogger(app.get(AppLogger));
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  app.use(requestIdMiddleware);
  app.enableCors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    exposedHeaders: [REQUEST_ID_HEADER],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  });
  app.enableShutdownHooks();
}
