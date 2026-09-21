/**
 * Помощники для интеграционных тестов (api): подготовить тестовую БД —
 * применить миграции и, при необходимости, засеять демо-мир.
 * Требует запущенного PostgreSQL (pnpm db:up) и DATABASE_URL_TEST.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const pkgRoot = path.resolve(__dirname, '..');

export interface PrepareTestDatabaseOptions {
  /** Строка подключения к тестовой БД; по умолчанию DATABASE_URL_TEST. */
  url?: string;
  /** Засеять демо-мир после миграций. */
  seed?: boolean;
  /** Сбросить схему перед миграциями (prisma migrate reset). */
  reset?: boolean;
}

export function resolveTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST не задан. Скопируй .env.example в .env и запусти `pnpm db:up` (создаст базу edu_test).',
    );
  }
  return url;
}

function runPrisma(args: string[], url: string): void {
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [pkgRoot] });
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: pkgRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

/** Применяет миграции (и seed) к тестовой БД. Идемпотентно. */
export function prepareTestDatabase(options: PrepareTestDatabaseOptions = {}): string {
  const url = options.url ?? resolveTestDatabaseUrl();
  if (options.reset) runPrisma(['migrate', 'reset', '--force', '--skip-seed'], url);
  runPrisma(['migrate', 'deploy'], url);
  if (options.seed) {
    const tsx = require.resolve('tsx/cli', { paths: [pkgRoot] });
    execFileSync(process.execPath, [tsx, path.join(pkgRoot, 'src', 'seed', 'index.ts')], {
      cwd: pkgRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  }
  return url;
}
