import { PrismaClient, type Prisma } from '../generated/client';

export type PrismaLogLevel = Prisma.LogLevel;

export interface CreatePrismaClientOptions {
  /** Строка подключения; по умолчанию — DATABASE_URL из окружения. */
  url?: string;
  /** Уровни логирования Prisma. По умолчанию: только ошибки и предупреждения. */
  log?: PrismaLogLevel[];
}

/** Создаёт новый экземпляр клиента (для api, worker, тестов). */
export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const url = options.url ?? process.env.DATABASE_URL;
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: options.log ?? ['warn', 'error'],
  });
}

declare global {
  var __eduPrisma: PrismaClient | undefined;
}

/**
 * Ленивый singleton для скриптов и dev-режима (переживает hot reload).
 * В NestJS используется PrismaService со своим жизненным циклом — он вызывает createPrismaClient().
 */
export function getPrisma(): PrismaClient {
  if (!globalThis.__eduPrisma) globalThis.__eduPrisma = createPrismaClient();
  return globalThis.__eduPrisma;
}
