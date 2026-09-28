import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { waitUntil } from '@vercel/functions';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Точка входа Vercel Functions: одна функция на весь /api/* (см. vercel.json в корне).
 * Приложение Nest поднимается один раз на инстанс и переиспользуется между вызовами.
 * Фоновые задачи inline-очереди удерживают инстанс через `waitUntil` до их завершения
 * (в пределах maxDuration функции), поэтому pipeline course-builder доезжает до конца.
 */
let ready: Promise<RequestListener> | undefined;

/** Сертификат НУЦ Минцифры приходит в env в base64 — на serverless нет своего файла на диске. */
function materializeCaCert(): void {
  const b64 = process.env.GIGACHAT_CA_CERT_B64;
  if (!b64 || process.env.GIGACHAT_CA_CERT_PATH) return;
  const file = '/tmp/gigachat-ca.pem';
  writeFileSync(file, Buffer.from(b64, 'base64'));
  process.env.GIGACHAT_CA_CERT_PATH = file;
}

async function create(): Promise<RequestListener> {
  materializeCaCert();
  const env = loadEnv({ skipDotenv: true });
  const app = await NestFactory.create(
    AppModule.forRoot(env, 'api', { keepAlive: waitUntil }),
    new ExpressAdapter(),
    { bufferLogs: true },
  );
  configureApp(app, env);
  await app.init();
  return app.getHttpAdapter().getInstance() as RequestListener;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= create().catch((error: unknown) => {
    ready = undefined; // следующий вызов попробует поднять приложение заново
    throw error;
  });
  const listener = await ready;
  listener(req, res);
}
