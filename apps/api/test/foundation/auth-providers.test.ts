import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DevAuthProvider } from '../../src/common/auth/providers/dev-auth.provider';
import { MaxAuthProvider } from '../../src/common/auth/providers/max-auth.provider';
import { testEnv } from '../helpers/env';

describe('DevAuthProvider', () => {
  const dev = new DevAuthProvider();

  it('знает демо-пользователей из фикстур', async () => {
    const identity = await dev.verify({ kind: 'dev', maxUserId: 'max-teacher-1' });
    expect(identity.firstName).toBe('Мария');
  });

  it('создаёт личность для неизвестного id', async () => {
    const identity = await dev.verify({ kind: 'dev', maxUserId: 'someone', firstName: 'Тест' });
    expect(identity).toMatchObject({ maxUserId: 'someone', firstName: 'Тест' });
  });

  it('не принимает launch-параметры MAX', async () => {
    await expect(dev.verify({ kind: 'max', launchParams: '' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('MaxAuthProvider (схема подписи — проверить по dev.max.ru)', () => {
  const secret = 'max-app-secret';
  const max = new MaxAuthProvider(testEnv({ AUTH_PROVIDER: 'max', MAX_BOT_TOKEN: secret }));

  function sign(params: Record<string, string>): string {
    const dataCheckString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const key = createHmac('sha256', 'WebAppData').update(secret).digest();
    const hash = createHmac('sha256', key).update(dataCheckString).digest('hex');
    // Как MAX: значения кодируются encodeURIComponent (пробел → %20, '+' остаётся '+'),
    // а не form-encoding URLSearchParams (пробел → '+').
    return Object.entries({ ...params, hash })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
  }

  it('значения с пробелами и плюсами: декодирование как в референсе MAX', async () => {
    const tricky = JSON.stringify({
      id: 7,
      first_name: 'Max User',
      photo_url: 'https://i.oneme.ru/i?r=a+b=c&x=1',
    });
    const identity = await max.verify({
      kind: 'max',
      launchParams: sign({
        user: tricky,
        auth_date: String(Math.floor(Date.now() / 1000)),
        chat: '{"id":12345,"type":"DIALOG"}',
        ip: '192.168.0.1',
      }),
    });
    expect(identity).toMatchObject({
      maxUserId: '7',
      firstName: 'Max User',
      avatarUrl: 'https://i.oneme.ru/i?r=a+b=c&x=1',
    });
  });

  const user = JSON.stringify({
    id: 42,
    first_name: 'Иван',
    last_name: 'Петров',
    username: 'ivan',
  });

  it('принимает валидную подпись', async () => {
    const identity = await max.verify({
      kind: 'max',
      launchParams: sign({ user, auth_date: String(Math.floor(Date.now() / 1000)) }),
    });
    expect(identity).toMatchObject({ maxUserId: '42', firstName: 'Иван', nickname: 'ivan' });
  });

  it('язык клиента MAX не переносится: пользователь создаётся с locale=ru', async () => {
    const english = JSON.stringify({ id: 43, first_name: 'John', language_code: 'en' });
    const identity = await max.verify({
      kind: 'max',
      launchParams: sign({ user: english, auth_date: String(Math.floor(Date.now() / 1000)) }),
    });
    expect(identity).toMatchObject({ maxUserId: '43', firstName: 'John', locale: 'ru' });
  });

  it('отклоняет подделанную подпись', async () => {
    const forged = sign({ user, auth_date: String(Math.floor(Date.now() / 1000)) }).replace(
      /hash=\w{4}/,
      'hash=dead',
    );
    await expect(max.verify({ kind: 'max', launchParams: forged })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('отклоняет параметры без auth_date и с датой из будущего', async () => {
    await expect(max.verify({ kind: 'max', launchParams: sign({ user }) })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    const future = sign({ user, auth_date: String(Math.floor(Date.now() / 1000) + 3600) });
    await expect(max.verify({ kind: 'max', launchParams: future })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('отклоняет устаревшие параметры', async () => {
    const old = sign({ user, auth_date: String(Math.floor(Date.now() / 1000) - 3 * 86400) });
    await expect(max.verify({ kind: 'max', launchParams: old })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
