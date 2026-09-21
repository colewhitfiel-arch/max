import { type Env, loadEnv } from '../../src/config/env';

/** Тестовое окружение: без чтения .env, минимальные обязательные значения, всё в mock/inline. */
export function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  return loadEnv({
    skipDotenv: true,
    overrides: {
      NODE_ENV: 'test',
      APP_ENV: 'development',
      LOG_LEVEL: 'silent',
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/edu_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-32',
      AUTH_PROVIDER: 'dev',
      AI_PROVIDER: 'mock',
      QUEUE_DRIVER: 'inline',
      STORAGE_DRIVER: 'local',
      PAYMENT_PROVIDER: 'fake',
      CORS_ORIGINS: 'http://localhost:5173',
      ...overrides,
    },
  });
}
