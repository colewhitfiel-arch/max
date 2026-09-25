#!/usr/bin/env node
/**
 * Проверка связи с GigaChat на реальном ключе (docs/12, workstream K).
 *
 *   node scripts/smoke-gigachat.mjs            # OAuth + список моделей + чат на GIGACHAT_MODEL
 *   node scripts/smoke-gigachat.mjs --stream   # ещё и потоковый ответ (как у тьютора)
 *   node scripts/smoke-gigachat.mjs --model=GigaChat-2-Pro
 *
 * Параметры берутся из `.env` в корне репозитория (секция GigaChat). Скрипт ничего не пишет
 * в БД и не трогает приложение — только сеть. Сам ключ не печатается никогда.
 *
 * Зачем: `AI_PROVIDER=mock` отвечает детерминированными заглушками, и со стороны это выглядит
 * как «тьютор повторяет одно и то же». Этот скрипт отвечает на вопрос «а ключ-то рабочий?»
 * до того, как переключать провайдера.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const wantStream = args.includes('--stream');

const DEFAULTS = {
  GIGACHAT_SCOPE: 'GIGACHAT_API_PERS',
  GIGACHAT_MODEL: 'GigaChat-2',
  GIGACHAT_OAUTH_URL: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  GIGACHAT_API_URL: 'https://gigachat.devices.sberbank.ru/api/v1',
  GIGACHAT_TIMEOUT_MS: '30000',
};

/** `.env` в корне: `KEY=value`, без раскрытия переменных и кавычек. */
function loadEnv() {
  let text = '';
  try {
    text = readFileSync(path.join(root, '.env'), 'utf8');
  } catch {
    fail('нет файла .env в корне репозитория — скопируй .env.example');
  }
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return { ...DEFAULTS, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')) };
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const env = loadEnv();
const model = flag('model') ?? env.GIGACHAT_MODEL;
const timeoutMs = Number(env.GIGACHAT_TIMEOUT_MS);

if (!env.GIGACHAT_AUTH_KEY) {
  fail(
    'GIGACHAT_AUTH_KEY пуст. Возьми Authorization key в личном кабинете GigaChat\n' +
      '  (developers.sber.ru → GigaChat API → ключ в формате base64 от client_id:client_secret)\n' +
      '  и впиши в .env. Без него приложение работает на AI_PROVIDER=mock и отвечает заглушками.',
  );
}

/** fetch с таймаутом: зависший запрос не должен держать скрипт вечно. */
async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 1. OAuth ----------
console.log(`scope ${env.GIGACHAT_SCOPE} · модель ${model}`);
let token;
try {
  const started = Date.now();
  const res = await request(env.GIGACHAT_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${env.GIGACHAT_AUTH_KEY}`,
      RqUID: randomUUID(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: `scope=${encodeURIComponent(env.GIGACHAT_SCOPE)}`,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401)
      fail(`OAuth 401: ключ или scope не подходят. Ответ: ${text.slice(0, 200)}`);
    fail(`OAuth ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  token = data.access_token;
  const expiresAt =
    Number(data.expires_at) < 1e12 ? Number(data.expires_at) * 1000 : Number(data.expires_at);
  console.log(
    `✓ OAuth ${Date.now() - started} мс · токен живёт ${Math.round((expiresAt - Date.now()) / 60000)} мин`,
  );
} catch (error) {
  if (error?.name === 'AbortError') fail(`OAuth: таймаут ${timeoutMs} мс`);
  // Самая частая причина в РФ — отсутствие корневого сертификата НУЦ Минцифры.
  const hint =
    String(error?.cause?.code ?? '').includes('CERT') || String(error).includes('certificate')
      ? '\n  Похоже на проблему с сертификатом: скачай корневой сертификат НУЦ Минцифры\n' +
        '  и укажи путь в GIGACHAT_CA_CERT_PATH.'
      : '';
  fail(`OAuth: сеть — ${error?.cause?.code ?? error?.message ?? error}${hint}`);
}

// ---------- 2. Доступные модели ----------
const models = await request(`${env.GIGACHAT_API_URL}/models`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
if (models.ok) {
  const ids = JSON.parse(await models.text()).data.map((m) => m.id);
  console.log(`✓ модели: ${ids.join(', ')}`);
  if (!ids.includes(model)) {
    console.warn(
      `⚠ модели «${model}» нет в списке — GIGACHAT_MODEL в .env стоит поправить на одну из доступных`,
    );
  }
} else {
  console.warn(`⚠ список моделей: ${models.status} (на работу чата обычно не влияет)`);
}

// ---------- 3. Чат ----------
const messages = [
  { role: 'system', content: 'Ты дружелюбный репетитор для школьника. Отвечай коротко.' },
  { role: 'user', content: 'Объясни в двух предложениях, зачем нужны дроби.' },
];

const chat = await request(`${env.GIGACHAT_API_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({ model, messages, stream: false, temperature: 0.7 }),
});
const chatText = await chat.text();
if (!chat.ok) fail(`chat ${chat.status}: ${chatText.slice(0, 300)}`);
const completion = JSON.parse(chatText);
console.log(`✓ chat · ${completion.usage?.total_tokens ?? '?'} токенов`);
console.log(`  «${completion.choices[0].message.content.trim()}»`);

// ---------- 4. Стрим (как у тьютора) ----------
if (wantStream) {
  const res = await request(`${env.GIGACHAT_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
  });
  if (!res.ok) fail(`stream ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let tokens = 0;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const data = part
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!data || data === '[DONE]') continue;
      if (JSON.parse(data).choices?.[0]?.delta?.content) tokens += 1;
    }
  }
  console.log(`✓ stream · ${tokens} чанков с текстом`);
}

console.log('\nКлюч рабочий. Чтобы приложение пошло в GigaChat: AI_PROVIDER=gigachat в .env.');
