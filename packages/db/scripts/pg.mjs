#!/usr/bin/env node
/**
 * Локальный PostgreSQL без Docker на бинарниках `embedded-postgres`.
 *
 *   node scripts/pg.mjs up      — initdb (если нужно) + pg_ctl start, сервер живёт после выхода
 *   node scripts/pg.mjs down    — pg_ctl stop
 *   node scripts/pg.mjs status  — pg_ctl status
 *
 * Порт/пользователь/пароль/имя БД берутся из DATABASE_URL (.env в корне), по умолчанию
 * postgresql://postgres:postgres@localhost:5432/edu. Данные — в <repo>/.data/pg.
 * Если у тебя есть Docker — используй infra/docker-compose.yml, этот скрипт не нужен.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const dataDir = path.join(repoRoot, '.data', 'pg');
const require = createRequire(import.meta.url);

loadDotEnv(path.join(repoRoot, '.env'));
const dbUrl = new URL(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/edu',
);
const port = dbUrl.port || '5432';
const user = decodeURIComponent(dbUrl.username || 'postgres');
const password = decodeURIComponent(dbUrl.password || 'postgres');
const dbName = dbUrl.pathname.replace(/^\//, '') || 'edu';

const binDir = resolveBinDir();
const exe = (name) => path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);
const env = { ...process.env, LC_ALL: 'C', LANG: 'C', PGPASSWORD: password };

const command = process.argv[2] ?? 'up';
switch (command) {
  case 'up':
    up();
    break;
  case 'down':
    run('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { allowFail: true });
    break;
  case 'status':
    run('pg_ctl', ['-D', dataDir, 'status'], { allowFail: true });
    break;
  default:
    console.error(`Неизвестная команда: ${command}. Используй up | down | status`);
    process.exit(1);
}

function up() {
  mkdirSync(path.dirname(dataDir), { recursive: true });
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log(`pg: initdb → ${dataDir}`);
    const pwFile = path.join(path.dirname(dataDir), 'pg.pw');
    // Файл с паролем нужен только initdb: удаляем сразу после вызова, в том числе при ошибке.
    writeFileSync(pwFile, password, { mode: 0o600 });
    const init = run(
      'initdb',
      [
        '-D',
        dataDir,
        '-U',
        user,
        '-A',
        'password',
        `--pwfile=${pwFile}`,
        '-E',
        'UTF8',
        '--locale=C',
      ],
      { allowFail: true },
    );
    rmSync(pwFile, { force: true });
    if (init.status !== 0) {
      console.error(`pg: initdb завершился с кодом ${init.status}`);
      process.exit(init.status ?? 1);
    }
  }
  const status = spawnSync(exe('pg_ctl'), ['-D', dataDir, 'status'], { env, encoding: 'utf8' });
  if (status.status === 0) {
    console.log(`pg: уже запущен (порт ${port})`);
  } else {
    console.log(`pg: старт на порту ${port}`);
    run(
      'pg_ctl',
      [
        '-D',
        dataDir,
        '-l',
        path.join(dataDir, 'postgres.log'),
        '-o',
        `-p ${port} -c listen_addresses=127.0.0.1`,
        '-w',
        'start',
      ],
      { detachedOutput: true },
    );
  }
  ensureDatabase(dbName);
  ensureDatabase(`${dbName}_test`);
  console.log(`pg: готово → postgresql://${user}:***@localhost:${port}/${dbName}`);
}

function ensureDatabase(name) {
  // Имя подставляется в SQL строкой — допускаем только безопасные символы.
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    console.error(
      `pg: недопустимое имя базы «${name}» в DATABASE_URL (разрешены A-Z, a-z, 0-9, _)`,
    );
    process.exit(1);
  }
  const check = spawnSync(
    exe('psql'),
    [
      '-h',
      '127.0.0.1',
      '-p',
      port,
      '-U',
      user,
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${name}'`,
    ],
    { env, encoding: 'utf8' },
  );
  if (check.error || check.stdout === undefined) {
    // В сборке embedded-postgres для некоторых платформ (darwin-arm64) нет psql:
    // базу создаст prisma при `migrate dev` / `migrate deploy`.
    console.log(`pg: psql недоступен — базу ${name} создаст prisma migrate`);
    return;
  }
  if (check.stdout.trim() === '1') return;
  run('psql', [
    '-h',
    '127.0.0.1',
    '-p',
    port,
    '-U',
    user,
    '-d',
    'postgres',
    '-c',
    `CREATE DATABASE "${name}"`,
  ]);
  console.log(`pg: создана база ${name}`);
}

function run(bin, args, { allowFail = false, detachedOutput = false } = {}) {
  // Для pg_ctl start все stdio = 'ignore': сервер наследует дескрипторы, и любой pipe
  // (например `pnpm db:up | tail`) не закроется, пока жив postgres. Вывод сервера — в postgres.log.
  const res = spawnSync(exe(bin), args, {
    env,
    stdio: detachedOutput ? 'ignore' : ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  if (res.status !== 0 && !allowFail) {
    console.error(`pg: ${bin} завершился с кодом ${res.status}`);
    process.exit(res.status ?? 1);
  }
  return res;
}

function resolveBinDir() {
  const platform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const pkg = `@embedded-postgres/${platform}`;
  try {
    // Платформенный пакет — optional-зависимость embedded-postgres, резолвим от его main.
    // Оба пакета закрывают package.json через "exports", поэтому идём через dist/index.js.
    const hostMain = require.resolve('embedded-postgres');
    const platformMain = createRequire(hostMain).resolve(pkg); // <pkg>/dist/index.js
    return path.join(path.dirname(platformMain), '..', 'native', 'bin');
  } catch {
    console.error(
      `pg: не найден пакет ${pkg}. Установи зависимости (pnpm install) или используй Docker: infra/docker-compose.yml`,
    );
    process.exit(1);
  }
}

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    // Как dotenv: пробелы по краям, кавычки '...' / "...", комментарий ` # …` у значения без кавычек.
    const raw = m[2].trim();
    const quoted = /^(['"])(.*)\1$/.exec(raw);
    const value = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
