import { describe, expect, it } from 'vitest';
import { corsOrigin } from '../../src/bootstrap';
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

  it('вне development dev-секрет JWT запрещён: публичный стенд — staging (ADR-014)', () => {
    const devSecret = 'dev-only-secret-change-me-please-32chars';
    expect(() => testEnv({ APP_ENV: 'staging', JWT_SECRET: devSecret })).toThrow(/JWT_SECRET/);
    expect(testEnv({ JWT_SECRET: devSecret }).JWT_SECRET).toBe(devSecret);
    // Заглушки и dev-вход на staging остаются допустимыми
    const staging = testEnv({ APP_ENV: 'staging', PAYMENT_PROVIDER: 'fake', AI_PROVIDER: 'mock' });
    expect(staging.AUTH_PROVIDER).toBe('dev');
  });

  it('пустой CORS_ORIGINS разрешает любой origin только в development', () => {
    expect(corsOrigin(testEnv({ CORS_ORIGINS: '' }))).toBe(true);
    expect(corsOrigin(testEnv({ APP_ENV: 'staging', CORS_ORIGINS: '' }))).toBe(false);
    expect(corsOrigin(testEnv({ APP_ENV: 'staging', CORS_ORIGINS: 'https://a.example' }))).toEqual([
      'https://a.example',
    ]);
  });

  it('в production запрещены заглушки оплаты и ИИ', () => {
    expect(() => testEnv({ APP_ENV: 'production', PAYMENT_PROVIDER: 'fake' })).toThrow(
      /PAYMENT_PROVIDER/,
    );
    expect(() => testEnv({ APP_ENV: 'production', AI_PROVIDER: 'mock' })).toThrow(/AI_PROVIDER/);
  });

  it('пустые строки считаются незаданными', () => {
    const env = testEnv({ REDIS_URL: '' as string });
    expect(env.REDIS_URL).toBeUndefined();
  });
});
