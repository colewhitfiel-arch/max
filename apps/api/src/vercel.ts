import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { waitUntil } from '@vercel/functions';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { PrismaService } from './common/prisma/prisma.service';
import { loadEnv } from './config/env';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

interface Instance {
  listener: RequestListener;
  prisma: PrismaService;
}

/**
 * Точка входа Vercel Functions: одна функция на весь /api/* (см. vercel.json в корне).
 * Приложение Nest поднимается один раз на инстанс и переиспользуется между вызовами.
 * Фоновые задачи inline-очереди удерживают инстанс через `waitUntil` до их завершения
 * (в пределах maxDuration функции), поэтому pipeline course-builder доезжает до конца.
 *
 * База (Neon, бесплатный тариф) засыпает через 5 минут простоя и рвёт открытые соединения:
 * первый запрос после паузы получал от Prisma `PostgreSQL connection: kind: Closed` и падал в 500.
 * Поэтому после простоя дольше IDLE_PROBE_MS перед запросом делается пробный `SELECT 1`, а при
 * сбое — переподключение; в строку подключения добавляется `connect_timeout`, чтобы Prisma
 * дождалась пробуждения compute, а не отваливалась по своему умолчанию в 5 с.
 */
let ready: Promise<Instance> | undefined;
let lastRequestAt = 0;
const IDLE_PROBE_MS = 30_000;

/** Сертификат НУЦ Минцифры приходит в env в base64 — на serverless нет своего файла на диске. */
function materializeCaCert(): void {
  const b64 = process.env.GIGACHAT_CA_CERT_B64;
  if (!b64 || process.env.GIGACHAT_CA_CERT_PATH) return;
  const file = '/tmp/gigachat-ca.pem';
  writeFileSync(file, Buffer.from(b64, 'base64'));
  process.env.GIGACHAT_CA_CERT_PATH = file;
}

/** Параметры строки подключения для serverless + Neon; уже заданные значения не трогаем. */
export function withServerlessDbParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const defaults: Record<string, string> = {
    // Пробуждение compute Neon занимает до нескольких секунд — дефолтных 5 с Prisma не хватает.
    connect_timeout: '15',
    pool_timeout: '15',
    // На инстанс — один процесс; большой пул только удерживает лишние соединения пулера.
    connection_limit: '5',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

/**
 * На Vercel у инстансов нет общего диска: файл, загруженный в один, другой не видит (а /tmp
 * исчезает вместе с инстансом). Локальное хранилище здесь не работает никогда, поэтому без S3
 * байты живут в Postgres — загрузка конспектов и сдач работает и на бесплатном стенде.
 */
export function serverlessStorageDriver(driver: string | undefined): string {
  return driver === 's3' ? 's3' : 'postgres';
}

async function create(): Promise<Instance> {
  materializeCaCert();
  process.env.STORAGE_DRIVER = serverlessStorageDriver(process.env.STORAGE_DRIVER);
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = withServerlessDbParams(process.env.DATABASE_URL);
  }
  const env = loadEnv({ skipDotenv: true });
  const app = await NestFactory.create(
    AppModule.forRoot(env, 'api', { keepAlive: waitUntil }),
    new ExpressAdapter(),
    { bufferLogs: true },
  );
  configureApp(app, env);
  await app.init();
  return {
    listener: app.getHttpAdapter().getInstance() as RequestListener,
    prisma: app.get(PrismaService),
  };
}

/** После простоя проверяет соединение с БД; закрытое пулером — пересоздаёт. */
async function ensureDbAlive(prisma: PrismaService): Promise<void> {
  const now = Date.now();
  const idle = now - lastRequestAt;
  lastRequestAt = now;
  if (idle < IDLE_PROBE_MS) return;
  if (await prisma.ping()) return;
  try {
    await prisma.$disconnect();
  } catch {
    /* соединение уже закрыто — это и чиним */
  }
  await prisma.$connect();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= create().catch((error: unknown) => {
    ready = undefined; // следующий вызов попробует поднять приложение заново
    throw error;
  });
  const instance = await ready;
  await ensureDbAlive(instance.prisma);
  instance.listener(req, res);
}
