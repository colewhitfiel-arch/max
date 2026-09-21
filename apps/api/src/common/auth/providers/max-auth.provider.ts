import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type Env } from '../../../config/env';
import { InjectEnv } from '../../../config/env.module';
import { Errors } from '../../errors/app-error';
import { type AuthProvider, type AuthProviderInput } from '../auth-provider';
import type { ExternalIdentity } from '../auth-user';

/**
 * Проверка launch-параметров мини-приложения MAX.
 *
 * ВНИМАНИЕ: точный формат подписи и полей нужно сверить с dev.max.ru (задача I2/Agent J).
 * Здесь реализована распространённая схема «query-string + HMAC-SHA256 от секрета приложения»
 * (как у Telegram initData / VK sign): все параметры, кроме `hash`, сортируются по ключу,
 * склеиваются `key=value` через `\n`, подписываются ключом `HMAC_SHA256("WebAppData", secret)`.
 * Если MAX использует другой алгоритм — меняется только этот файл.
 */
@Injectable()
export class MaxAuthProvider implements AuthProvider {
  readonly name = 'max' as const;
  private readonly maxAgeSec = 24 * 60 * 60;

  constructor(@InjectEnv() private readonly env: Env) {}

  async verify(input: AuthProviderInput): Promise<ExternalIdentity> {
    if (input.kind !== 'max')
      throw Errors.unauthorized('MAX-провайдер принимает только launch-параметры');
    const secret = this.env.MAX_APP_SECRET;
    if (!secret) throw Errors.internal('MAX_APP_SECRET не задан');

    const params = new URLSearchParams(input.launchParams);
    const hash = params.get('hash');
    if (!hash) throw Errors.unauthorized('Нет подписи launch-параметров');
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(secret).digest();
    const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (
      expected.length !== hash.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
    ) {
      throw Errors.unauthorized('Подпись launch-параметров неверна');
    }

    const authDate = Number(params.get('auth_date') ?? 0);
    if (authDate && Date.now() / 1000 - authDate > this.maxAgeSec) {
      throw Errors.unauthorized('Launch-параметры устарели');
    }

    const rawUser = params.get('user');
    if (!rawUser) throw Errors.unauthorized('Нет данных пользователя в launch-параметрах');
    let user: {
      id?: string | number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };
    try {
      user = JSON.parse(rawUser);
    } catch {
      throw Errors.unauthorized('Данные пользователя нечитаемы');
    }
    if (user.id === undefined) throw Errors.unauthorized('Нет id пользователя');

    return {
      maxUserId: String(user.id),
      firstName: user.first_name ?? 'Пользователь',
      lastName: user.last_name ?? null,
      nickname: user.username ?? null,
      avatarUrl: user.photo_url ?? null,
      locale: user.language_code === 'en' ? 'en' : 'ru',
    };
  }
}
