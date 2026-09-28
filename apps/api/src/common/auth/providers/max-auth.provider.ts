import { createHash, createHmac } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { type Env } from '../../../config/env';
import { InjectEnv } from '../../../config/env.module';
import { Errors } from '../../errors/app-error';
import { AppLogger } from '../../logger/logger.service';
import { type AuthProvider, type AuthProviderInput } from '../auth-provider';
import { safeEqual } from '../safe-equal';
import type { ExternalIdentity } from '../auth-user';

/**
 * Проверка launch-параметров мини-приложения MAX (`WebApp.initData`).
 *
 * Алгоритм по dev.max.ru/docs/webapps/validation (сверено 2026-09-24):
 *  1. из параметров вынуть `hash` (он должен быть ровно один);
 *  2. остальные URL-декодировать, отсортировать по ключу и склеить `key=value` через `\n`;
 *  3. `secret_key = HMAC_SHA256(key: "WebAppData", data: токен бота)`;
 *  4. `HMAC_SHA256(key: secret_key, data: строка из п.2)` в hex сравнить с `hash`.
 * Секрет — именно токен бота MAX (`MAX_BOT_TOKEN`), а не отдельный секрет приложения.
 */
@Injectable()
export class MaxAuthProvider implements AuthProvider {
  readonly name = 'max' as const;
  private readonly maxAgeSec = 24 * 60 * 60;
  private readonly clockSkewSec = 5 * 60;
  private readonly log: Logger;

  constructor(
    @InjectEnv() private readonly env: Env,
    @Optional() logger?: AppLogger,
  ) {
    this.log = logger ? logger.child({ module: 'auth-max' }) : pino({ level: 'silent' });
  }

  async verify(input: AuthProviderInput): Promise<ExternalIdentity> {
    if (input.kind !== 'max')
      throw Errors.unauthorized('MAX-провайдер принимает только launch-параметры');
    const botToken = this.env.MAX_BOT_TOKEN?.trim();
    if (!botToken) throw Errors.internal('MAX_BOT_TOKEN не задан');

    // Разбор — один в один с референсом dev.max.ru: split по '&', ключ до первого '=',
    // значение через decodeURIComponent (НЕ URLSearchParams: тот превращает '+' в пробел,
    // и строка для подписи расходится с той, что подписал MAX).
    const pairs = parseLaunchParams(input.launchParams);
    const keys = pairs.map(([k]) => k);
    const fail = (reason: string, message: string): never => {
      this.log.warn({ reason, keys, length: input.launchParams.length }, 'вход через MAX отклонён');
      throw Errors.unauthorized(message);
    };

    const hashes = pairs.filter(([k]) => k === 'hash');
    if (hashes.length !== 1) fail('no_hash', 'Нет подписи launch-параметров');
    const hash = hashes[0]![1];

    const dataCheckString = pairs
      .filter(([k]) => k !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (!safeEqual(expected, hash.toLowerCase())) {
      // Диагностика без утечки секретов: какой из альтернативных вариантов схемы совпал бы,
      // длина токена и его необратимый отпечаток (чтобы сверить с ожидаемым значением).
      this.log.warn(
        {
          reason: 'bad_signature',
          keys,
          length: input.launchParams.length,
          tokenLen: botToken.length,
          tokenSha8: createHash('sha256').update(botToken).digest('hex').slice(0, 8),
          variantsMatched: signatureVariants(input.launchParams, pairs, botToken, hash),
        },
        'вход через MAX отклонён',
      );
      throw Errors.unauthorized('Подпись launch-параметров неверна');
    }

    const get = (key: string): string | undefined => pairs.find(([k]) => k === key)?.[1];

    // auth_date обязателен: без него подписанные параметры можно было бы переиспользовать вечно
    const rawAuthDate = get('auth_date');
    const authDate = Number(rawAuthDate);
    if (!rawAuthDate || !Number.isFinite(authDate) || authDate <= 0) {
      fail('no_auth_date', 'Нет auth_date в launch-параметрах');
    }
    const age = Date.now() / 1000 - authDate;
    // Допуск 5 минут на рассинхрон часов в будущую сторону
    if (age > this.maxAgeSec || age < -this.clockSkewSec) {
      this.log.warn({ reason: 'stale', ageSec: Math.round(age), keys }, 'вход через MAX отклонён');
      throw Errors.unauthorized('Launch-параметры устарели');
    }

    const rawUser = get('user');
    if (!rawUser) fail('no_user', 'Нет данных пользователя в launch-параметрах');
    let user: {
      id?: string | number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };
    try {
      user = JSON.parse(rawUser!);
    } catch {
      fail('bad_user_json', 'Данные пользователя нечитаемы');
    }
    if (user!.id === undefined) fail('no_user_id', 'Нет id пользователя');
    user = user!;

    return {
      maxUserId: String(user.id),
      firstName: user.first_name ?? 'Пользователь',
      lastName: user.last_name ?? null,
      nickname: user.username ?? null,
      avatarUrl: user.photo_url ?? null,
      // Интерфейс только на русском: выбора языка ни у одной роли нет (docs/00 §1.4), поэтому
      // `language_code` клиента MAX не переносится в настройки — иначе пользователь из
      // английского клиента застрял бы в английском интерфейсе без способа вернуться.
      locale: 'ru',
    };
  }
}

/**
 * Какие альтернативные схемы подписи дали бы совпадение с `hash`. Только для диагностики
 * в логах: по результату понятно, ошибка в токене (ни один вариант) или в схеме (какой-то совпал).
 */
export function signatureVariants(
  raw: string,
  pairs: [string, string][],
  botToken: string,
  hash: string,
): string[] {
  const target = hash.toLowerCase();
  const join = (entries: [string, string][]): string =>
    entries
      .filter(([k]) => k !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  const rawPairs: [string, string][] = raw.split('&').map((p) => {
    const i = p.indexOf('=');
    return i === -1 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
  });
  const decoded = join(pairs);
  const undecoded = join(rawPairs);
  const byteSorted = pairs
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const hmac = (key: Buffer | string, data: string): string =>
    createHmac('sha256', key).update(data).digest('hex');
  const derived = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const swapped = createHmac('sha256', botToken).update('WebAppData').digest();
  const candidates: Record<string, string> = {
    'undecoded-values': hmac(derived, undecoded),
    'byte-order-sort': hmac(derived, byteSorted),
    'secret-swapped': hmac(swapped, decoded),
    'secret-swapped-undecoded': hmac(swapped, undecoded),
    'plain-token-key': hmac(botToken, decoded),
    'plain-token-key-undecoded': hmac(botToken, undecoded),
    'sha256-token-key': hmac(createHash('sha256').update(botToken).digest(), decoded),
  };
  return Object.entries(candidates)
    .filter(([, value]) => value === target)
    .map(([name]) => name);
}

/**
 * `a=1&b=x%20y` → [['a','1'],['b','x y']]. Ключ — до первого '=', значение — всё после него,
 * декодированное как в референсе MAX (`decodeURIComponent`). Нечитаемые проценты оставляем как есть.
 */
export function parseLaunchParams(raw: string): [string, string][] {
  return raw
    .split('&')
    .filter((part) => part.length > 0)
    .map((part) => {
      const idx = part.indexOf('=');
      const key = idx === -1 ? part : part.slice(0, idx);
      const value = idx === -1 ? '' : part.slice(idx + 1);
      let decoded = value;
      try {
        decoded = decodeURIComponent(value);
      } catch {
        /* битая кодировка — подпись всё равно не сойдётся */
      }
      return [key, decoded];
    });
}
