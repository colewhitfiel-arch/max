import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { testEnv } from '../helpers/env';

describe('env', () => {
  it('валидное окружение парсится с дефолтами', () => {
    const env = testEnv();
    expect(env.API_PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
    expect(env.AI_PROVIDER).toBe('mock');
  });

  it('сообщает об отсутствии обязательных переменных', () => {
    expect(() => loadEnv({ skipDotenv: true, overrides: { DATABASE_URL: '' as string } })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('короткий JWT_SECRET отклоняется', () => {
    expect(() => testEnv({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('bullmq без REDIS_URL отклоняется', () => {
    expect(() => testEnv({ QUEUE_DRIVER: 'bullmq' })).toThrow(/REDIS_URL/);
  });

  it('gigachat без ключа отклоняется', () => {
    expect(() => testEnv({ AI_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: '' })).toThrow(
      /GIGACHAT_AUTH_KEY/,
    );
  });

  it('в production запрещён dev-вход и dev-секрет', () => {
    expect(() =>
      testEnv({
        APP_ENV: 'production',
        AUTH_PROVIDER: 'dev',
        JWT_SECRET: 'dev-only-secret-change-me-please-32chars',
      }),
    ).toThrow(/AUTH_PROVIDER|JWT_SECRET/);
  });

  it('пустые строки считаются незаданными', () => {
    const env = testEnv({ REDIS_URL: '' as string });
    expect(env.REDIS_URL).toBeUndefined();
  });
});
