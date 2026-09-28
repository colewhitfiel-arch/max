import { createHmac } from 'node:crypto';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { DevAuthProvider } from '../../src/common/auth/providers/dev-auth.provider';
import { MaxAuthProvider } from '../../src/common/auth/providers/max-auth.provider';
import type { AppLogger } from '../../src/common/logger/logger.service';
import { testEnv } from '../helpers/env';

/** Логгер, складывающий JSON-записи в массив (для проверки, что попадает в лог). */
function captureLogger(): { logger: AppLogger; entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  const root = pino(
    { level: 'debug' },
    { write: (line: string) => entries.push(JSON.parse(line)) },
  );
  return { logger: { child: (b: Record<string, unknown>) => root.child(b) } as AppLogger, entries };
}

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

  describe('лог неверной подписи', () => {
    const forgedParams = () =>
      sign({ user, auth_date: String(Math.floor(Date.now() / 1000)) }).replace(
        /hash=\w{4}/,
        'hash=dead',
      );

    it('по умолчанию — только причина: без разбора вариантов и отпечатка токена', async () => {
      const { logger, entries } = captureLogger();
      const provider = new MaxAuthProvider(
        testEnv({ AUTH_PROVIDER: 'max', MAX_BOT_TOKEN: secret }),
        logger,
      );
      await expect(
        provider.verify({ kind: 'max', launchParams: forgedParams() }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ reason: 'bad_signature' });
      expect(entries[0]).not.toHaveProperty('variantsMatched');
      expect(entries[0]).not.toHaveProperty('tokenSha8');
      expect(entries[0]).not.toHaveProperty('tokenLen');
      expect(JSON.stringify(entries)).not.toContain(secret);
    });

    it('MAX_AUTH_DEBUG=1 — разбор вариантов и отпечаток, но не сам токен', async () => {
      const { logger, entries } = captureLogger();
      const provider = new MaxAuthProvider(
        testEnv({ AUTH_PROVIDER: 'max', MAX_BOT_TOKEN: secret, MAX_AUTH_DEBUG: '1' }),
        logger,
      );
      await expect(
        provider.verify({ kind: 'max', launchParams: forgedParams() }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ reason: 'bad_signature', variantsMatched: [] });
      expect(entries[0]!.tokenSha8).toMatch(/^[0-9a-f]{8}$/);
      expect(JSON.stringify(entries)).not.toContain(secret);
    });
  });
});
