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

/** Запускает node-скрипт; при падении пробрасывает stderr в текст ошибки (иначе vitest его не покажет). */
function runNode(label: string, scriptArgs: string[], url: string): void {
  try {
    execFileSync(process.execPath, scriptArgs, {
      cwd: pkgRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
    throw new Error(`${label} завершился с ошибкой${stderr ? `:\n${stderr}` : ''}`, {
      cause: error,
    });
  }
}

function runPrisma(args: string[], url: string): void {
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [pkgRoot] });
  runNode(`prisma ${args.join(' ')}`, [prismaCli, ...args], url);
}

/** Применяет миграции (и seed) к тестовой БД. Идемпотентно. */
export function prepareTestDatabase(options: PrepareTestDatabaseOptions = {}): string {
  const url = options.url ?? resolveTestDatabaseUrl();
  // migrate reset сам применяет все миграции — deploy нужен только без сброса.
  if (options.reset) runPrisma(['migrate', 'reset', '--force', '--skip-seed'], url);
  else runPrisma(['migrate', 'deploy'], url);
  if (options.seed) {
    const tsx = require.resolve('tsx/cli', { paths: [pkgRoot] });
    runNode('seed', [tsx, path.join(pkgRoot, 'src', 'seed', 'index.ts')], url);
  }
  return url;
}
