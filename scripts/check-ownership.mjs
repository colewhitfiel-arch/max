#!/usr/bin/env node
/**
 * Проверка владения: изменённые файлы (git diff относительно базовой ветки или staged)
 * не должны принадлежать двум разным владельцам из OWNERS.yaml, если в сообщении
 * последнего коммита нет метки `cross-owner`.
 *
 *   node scripts/check-ownership.mjs            # сравнить с origin/main (или main)
 *   node scripts/check-ownership.mjs --staged   # только staged-изменения
 *   node scripts/check-ownership.mjs --base=HEAD~3
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2);
const staged = args.includes('--staged');
const baseArg = args.find((a) => a.startsWith('--base='))?.slice('--base='.length);

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function parseOwners(yaml) {
  // Минимальный парсер для формата OWNERS.yaml (owners: { name: [globs] })
  const owners = {};
  let current = null;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const ownerMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (ownerMatch) {
      current = ownerMatch[1];
      owners[current] = [];
      continue;
    }
    const globMatch = /^ {4}- (.+)$/.exec(line);
    if (globMatch && current) owners[current].push(globMatch[1].trim());
  }
  return owners;
}

function globToRegExp(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
      } else re += '[^/]*';
    } else if ('.+?^${}()|[]\\'.includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  return new RegExp(`${re}$`);
}

const owners = parseOwners(readFileSync(path.join(root, 'OWNERS.yaml'), 'utf8'));
const matchers = Object.entries(owners).map(([name, globs]) => ({
  name,
  regs: globs.map(globToRegExp),
}));

let files = [];
try {
  if (staged) files = sh('git diff --cached --name-only').split('\n');
  else {
    const base =
      baseArg ?? (sh('git rev-parse --verify --quiet origin/main') ? 'origin/main' : 'main');
    files = sh(`git diff --name-only ${base}...HEAD`).split('\n');
    if (files.length === 1 && files[0] === '') files = sh('git diff --name-only HEAD').split('\n');
  }
} catch {
  console.log('ownership: git diff недоступен (нет базовой ветки?) — пропускаю проверку');
  process.exit(0);
}
files = files.filter(Boolean);

const touched = new Map();
for (const f of files) {
  for (const m of matchers) {
    if (m.regs.some((r) => r.test(f))) {
      if (!touched.has(m.name)) touched.set(m.name, []);
      touched.get(m.name).push(f);
    }
  }
}

let lastMessage = '';
try {
  lastMessage = sh('git log -1 --pretty=%B');
} catch {
  /* пустой репозиторий */
}

if (touched.size > 1 && !/cross-owner/i.test(lastMessage)) {
  console.error('ownership: изменения затрагивают зоны нескольких владельцев:');
  for (const [name, list] of touched) console.error(`  [${name}]\n    ${list.join('\n    ')}`);
  console.error(
    'Разбей изменения по владельцам или добавь метку `cross-owner` в сообщение коммита.',
  );
  process.exit(1);
}

console.log(
  `ownership: ok (${files.length} файлов, владельцы: ${[...touched.keys()].join(', ') || 'нет'})`,
);
