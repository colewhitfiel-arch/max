import { type Env, loadEnv } from '../../src/config/env';

/**
 * Тестовое окружение: без чтения .env, минимальные обязательные значения, всё в mock/inline.
 * `pnpm test` всё же подмешивает корневой .env в process.env (dotenv-cli), поэтому лимиты
 * частоты сбрасываются к умолчаниям (в NODE_ENV=test — выключены): тест, которому они нужны,
 * задаёт их в `overrides`.
 */
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
      RATE_LIMIT_ENABLED: '',
      RATE_LIMIT_AUTH_PER_MIN: '',
      RATE_LIMIT_LINK_PER_HOUR: '',
      RATE_LIMIT_AI_PER_MIN: '',
      RATE_LIMIT_GENERATION_PER_HOUR: '',
      ...overrides,
    },
  });
}
