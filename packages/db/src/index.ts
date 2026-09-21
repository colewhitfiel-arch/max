/**
 * @edu/db — Prisma-клиент и типы. Схема: prisma/schema/*.prisma (multi-file).
 * Генерация: `pnpm db:generate`; миграции: `pnpm db:migrate`; seed: `pnpm db:seed`.
 */
export { PrismaClient, Prisma } from '../generated/client';
export type * from '../generated/client';
export { createPrismaClient, getPrisma, type CreatePrismaClientOptions } from './client';
