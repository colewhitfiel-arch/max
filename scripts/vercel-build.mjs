#!/usr/bin/env node
/**
 * Сборка на Vercel (buildCommand в vercel.json): turbo build api + web → миграции Prisma →
 * seed по флагу. Миграции идут через прямое (непулированное) подключение, если провайдер БД
 * его дал (Neon/Vercel Postgres кладут DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING).
 */
import { execSync } from 'node:child_process';

const run = (cmd, env = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
};

// prisma generate требует, чтобы DATABASE_URL был задан; к базе при этом не подключается.
const buildDbUrl = process.env.DATABASE_URL ?? 'postgresql://build:build@localhost:5432/build';
run('pnpm turbo run build --filter=@edu/api --filter=@edu/web', { DATABASE_URL: buildDbUrl });

const migrateUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!migrateUrl) {
  console.log('\nvercel-build: DATABASE_URL не задан — миграции и seed пропущены');
  process.exit(0);
}

run('pnpm --filter @edu/db exec prisma migrate deploy', { DATABASE_URL: migrateUrl });

if (process.env.SEED_ON_DEPLOY === '1') {
  // Seed идемпотентен (packages/db/src/seed): демо-школа, пользователи, кружки, курс.
  run('pnpm --filter @edu/db exec prisma db seed', { DATABASE_URL: migrateUrl });
}
