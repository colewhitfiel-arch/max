/**
 * Проверка подключения к БД и применённых миграций.
 * Требует запущенного PostgreSQL (`pnpm db:up`) и DATABASE_URL в .env.
 * Пропускается, если задан SKIP_DB_TESTS=1.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './client';

const skip = process.env.SKIP_DB_TESTS === '1' || !process.env.DATABASE_URL;

describe.skipIf(skip)('database connection', () => {
  const prisma = createPrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('отвечает на SELECT 1', async () => {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });

  it('миграции применены (таблица users существует)', async () => {
    const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
      ) AS "exists"`;
    expect(rows[0]?.exists).toBe(true);
  });

  it('нет упавших миграций', async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it('нет неприменённых миграций', async () => {
    // Prisma берёт миграции из <папка схемы>/migrations (package.json → prisma.schema).
    const migrationsDir = path.resolve(__dirname, '../prisma/schema/migrations');
    const local = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const applied = new Set(rows.map((row) => row.migration_name));
    expect(local.length).toBeGreaterThan(0);
    expect(local.filter((name) => !applied.has(name))).toEqual([]);
  });
});
