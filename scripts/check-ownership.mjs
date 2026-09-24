#!/usr/bin/env node
/**
 * Проверка владения по OWNERS.yaml: коммит не должен трогать зоны двух владельцев,
 * если в его сообщении нет метки `cross-owner`.
 *
 * У файла ровно один владелец — зона с самым конкретным совпавшим глобом (длиннее
 * литеральный префикс до первого `*`, затем длиннее глоб, затем объявленная ниже в файле).
 * Поэтому вложенные зоны (`packages/ai/**` ⊃ `packages/ai/src/prompts/**`) не считаются
 * пересечением.
 *
 *   node scripts/check-ownership.mjs                      # коммиты origin/main..HEAD (или main..HEAD)
 *                                                         # + предупреждение по незакоммиченным правкам
 *   node scripts/check-ownership.mjs --base=<rev> [--head=<rev>]   # коммиты base..head (CI)
 *   node scripts/check-ownership.mjs --staged [--cross-owner]      # staged-изменения (метку коммита
 *                                                         # ещё не видно — подтверждается флагом)
 *
 * Каждый коммит диапазона (без merge-коммитов) проверяется отдельно: в этом репозитории
 * коммиты идут прямо в main, и метка `cross-owner` ставится в сообщении коммита.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flagValue = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(`--${name}=`.length) || undefined;
const staged = args.includes('--staged');
const crossOwnerFlag = args.includes('--cross-owner');
const baseArg = flagValue('base');
const headArg = flagValue('head') ?? 'HEAD';
const LABEL = /cross-owner/i;

function git(...gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function lines(output) {
  return output.split('\n').filter(Boolean);
}

function refExists(ref) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
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
const rules = Object.entries(owners).flatMap(([name, globs]) =>
  globs.map((glob) => {
    const star = glob.indexOf('*');
    return {
      name,
      glob,
      re: globToRegExp(glob),
      prefix: star === -1 ? glob.length : star,
    };
  }),
);

/** Владелец файла: самый конкретный совпавший глоб; при равенстве — объявленный позже. */
function ownerOf(file) {
  let best = null;
  for (const rule of rules) {
    if (!rule.re.test(file)) continue;
    if (
      !best ||
      rule.prefix > best.prefix ||
      (rule.prefix === best.prefix && rule.glob.length >= best.glob.length)
    )
      best = rule;
  }
  return best?.name ?? null;
}

function groupByOwner(files) {
  const touched = new Map();
  for (const f of files) {
    const owner = ownerOf(f);
    if (!owner) continue;
    if (!touched.has(owner)) touched.set(owner, []);
    touched.get(owner).push(f);
  }
  return touched;
}

function printZones(touched, log = console.error) {
  for (const [name, list] of touched) log(`  [${name}]\n    ${list.join('\n    ')}`);
}

/** Проверяет каждый не-merge коммит диапазона base..head. Возвращает число нарушений. */
function checkCommits(base, head) {
  const shas = lines(git('rev-list', '--no-merges', '--reverse', `${base}..${head}`));
  let violations = 0;
  const allOwners = new Set();
  for (const sha of shas) {
    const files = lines(git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha));
    const touched = groupByOwner(files);
    for (const name of touched.keys()) allOwners.add(name);
    if (touched.size <= 1) continue;
    const message = git('log', '-1', '--format=%B', sha);
    if (LABEL.test(message)) continue;
    violations += 1;
    console.error(
      `ownership: коммит ${sha.slice(0, 7)} «${message.split('\n')[0]}» затрагивает зоны нескольких владельцев без метки cross-owner:`,
    );
    printZones(touched);
  }
  console.log(
    `ownership: ${base}..${head} — ${shas.length} коммит(ов), владельцы: ${[...allOwners].join(', ') || 'нет'}`,
  );
  return violations;
}

function fail() {
  console.error(
    'Разбей изменения по владельцам или добавь метку `cross-owner` в сообщение коммита.',
  );
  process.exit(1);
}

if (staged) {
  let files;
  try {
    files = lines(git('diff', '--cached', '--name-only'));
  } catch {
    console.log('ownership: git недоступен — пропускаю проверку');
    process.exit(0);
  }
  const touched = groupByOwner(files);
  if (touched.size > 1 && !crossOwnerFlag) {
    console.error('ownership: staged-изменения затрагивают зоны нескольких владельцев:');
    printZones(touched);
    console.error('Если коммит будет с меткой `cross-owner`, запусти с флагом --cross-owner.');
    fail();
  }
  console.log(
    `ownership: ok (staged: ${files.length} файлов, владельцы: ${[...touched.keys()].join(', ') || 'нет'})`,
  );
  process.exit(0);
}

let base = baseArg;
if (base && !refExists(base)) {
  console.warn(
    `ownership: ревизия --base=${base} не найдена (shallow clone или force-push?) — пропускаю проверку`,
  );
  process.exit(0);
}
if (!refExists(headArg)) {
  console.warn(`ownership: ревизия --head=${headArg} не найдена — пропускаю проверку`);
  process.exit(0);
}
if (!base) {
  base = refExists('origin/main') ? 'origin/main' : refExists('main') ? 'main' : null;
  if (!base)
    console.warn('ownership: базовая ветка (origin/main, main) не найдена — укажи --base=<rev>');
}

let violations = 0;
try {
  if (base) violations = checkCommits(base, headArg);
} catch (error) {
  console.warn(
    `ownership: git log недоступен (${error.message.split('\n')[0]}) — пропускаю проверку коммитов`,
  );
}

// Локальный запуск без --base: незакоммиченные правки. Метки коммита ещё нет — только предупреждение.
if (!baseArg) {
  try {
    const files = [
      ...new Set([
        ...lines(git('diff', '--name-only', 'HEAD')),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const touched = groupByOwner(files);
    if (touched.size > 1)
      console.warn(
        `ownership: незакоммиченные правки (${files.length} файлов) затрагивают зоны ${[...touched.keys()].join(', ')} — в сообщении коммита понадобится метка cross-owner`,
      );
    else console.log(`ownership: незакоммиченных файлов — ${files.length}`);
  } catch {
    /* пустой репозиторий или нет HEAD */
  }
}

if (violations > 0) fail();
console.log('ownership: ok');
