import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@edu/contracts';
import { AppLogger } from './common/logger/logger.service';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/logger/request-id.middleware';
import { type Env } from './config/env';

/**
 * Какие origin пускать через CORS. Явный `CORS_ORIGINS` — только их. Пустой список в development —
 * любой origin (web на своём порту); вне development — CORS выключен: стенд отдаёт web и api
 * с одного origin (Vercel — ADR-014, nginx — compose.yaml), и чужой сайт ответы api не прочитает.
 */
export function corsOrigin(env: Pick<Env, 'APP_ENV' | 'CORS_ORIGINS'>): string[] | boolean {
  if (env.CORS_ORIGINS.length > 0) return env.CORS_ORIGINS;
  return env.APP_ENV === 'development';
}

/** Общая настройка HTTP-приложения для main.ts и тестов: префикс, CORS, request-id, логгер. */
export function configureApp(app: INestApplication, env: Env): void {
  app.useLogger(app.get(AppLogger));
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  app.use(requestIdMiddleware);
  app.enableCors({
    origin: corsOrigin(env),
    exposedHeaders: [REQUEST_ID_HEADER],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  });
  app.enableShutdownHooks();
}
