/**
 * Конфигурация из окружения. Единственное место, где читается process.env.
 * Загружает корневой .env (по pnpm-workspace.yaml вверх от cwd) и валидирует схемой zod.
 * Приложение не стартует с невалидным окружением — ошибка перечисляет проблемные переменные.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-secret-change-me-please-32chars';

const optionalString = z.string().min(1).optional();
const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    API_PORT: z.coerce.number().int().positive().default(3000),
    API_URL: z.string().url().default('http://localhost:3000'),
    WEB_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
    DATABASE_URL_TEST: optionalString,

    QUEUE_DRIVER: z.enum(['inline', 'bullmq']).default('inline'),
    REDIS_URL: optionalString,

    AUTH_PROVIDER: z.enum(['dev', 'max']).default('dev'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET: минимум 32 символа'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    MAX_APP_ID: optionalString,
    /** Токен бота MAX: им подписаны launch-параметры мини-приложения (dev.max.ru/docs/webapps). */
    MAX_BOT_TOKEN: optionalString,

    AI_PROVIDER: z.enum(['mock', 'gigachat']).default('mock'),
    GIGACHAT_AUTH_KEY: optionalString,
    GIGACHAT_SCOPE: z.string().default('GIGACHAT_API_PERS'),
    GIGACHAT_MODEL: z.string().default('GigaChat-2'),
    GIGACHAT_OAUTH_URL: z
      .string()
      .url()
      .default('https://ngw.devices.sberbank.ru:9443/api/v2/oauth'),
    GIGACHAT_API_URL: z.string().url().default('https://gigachat.devices.sberbank.ru/api/v1'),
    GIGACHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    GIGACHAT_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
    /** Одновременных запросов к GigaChat: персональный тариф — 1 (иначе 429), B2B — больше. */
    GIGACHAT_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
    GIGACHAT_CA_CERT_PATH: optionalString,
    /** Лимит сообщений тьютору на пользователя в сутки (429 при превышении). */
    AI_TUTOR_DAILY_LIMIT: z.coerce.number().int().positive().default(50),
    /** Сколько окон survey / уроков course-builder генерируется параллельно. */
    COURSE_BUILDER_MAX_PARALLEL: z.coerce.number().int().min(1).max(8).default(3),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.data/storage'),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default('ru-central1'),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_KEY: optionalString,
    S3_FORCE_PATH_STYLE: boolFromString.default(true),

    PAYMENT_PROVIDER: z.enum(['fake', 'yookassa']).default('fake'),
    YOOKASSA_SHOP_ID: optionalString,
    YOOKASSA_SECRET_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    const need = (cond: boolean, key: string, why: string) => {
      if (cond) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: why });
    };
    need(
      env.QUEUE_DRIVER === 'bullmq' && !env.REDIS_URL,
      'REDIS_URL',
      'обязателен при QUEUE_DRIVER=bullmq',
    );
    need(
      env.AUTH_PROVIDER === 'max' && !env.MAX_BOT_TOKEN,
      'MAX_BOT_TOKEN',
      'обязателен при AUTH_PROVIDER=max',
    );
    need(
      env.AI_PROVIDER === 'gigachat' && !env.GIGACHAT_AUTH_KEY,
      'GIGACHAT_AUTH_KEY',
      'обязателен при AI_PROVIDER=gigachat',
    );
    need(
      env.STORAGE_DRIVER === 's3' &&
        !(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY),
      'S3_BUCKET',
      'при STORAGE_DRIVER=s3 нужны S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY',
    );
    need(
      env.PAYMENT_PROVIDER === 'yookassa' && !(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY),
      'YOOKASSA_SHOP_ID',
      'при PAYMENT_PROVIDER=yookassa нужны YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY',
    );
    if (env.APP_ENV === 'production') {
      need(
        env.JWT_SECRET === DEV_JWT_SECRET,
        'JWT_SECRET',
        'в production нельзя использовать dev-секрет',
      );
      need(env.AUTH_PROVIDER === 'dev', 'AUTH_PROVIDER', 'в production dev-вход запрещён');
      need(env.CORS_ORIGINS.length === 0, 'CORS_ORIGINS', 'в production нужен явный список origin');
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Ищет корень монорепо (pnpm-workspace.yaml) вверх от заданной директории. */
export function findRepoRoot(from: string = process.cwd()): string | null {
  let dir = path.resolve(from);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Пустые строки из .env считаем незаданными переменными. */
function stripEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

export interface LoadEnvOptions {
  /** Не читать .env с диска (тесты). */
  skipDotenv?: boolean;
  /** Переопределения поверх process.env. */
  overrides?: Partial<Record<keyof Env, string>>;
}

export function loadEnv(options: LoadEnvOptions = {}): Env {
  if (!options.skipDotenv) {
    const root = findRepoRoot(__dirname) ?? findRepoRoot();
    if (root) dotenv.config({ path: path.join(root, '.env'), override: false, quiet: true });
  }
  const raw = stripEmpty({ ...process.env, ...(options.overrides ?? {}) });
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Невалидное окружение (см. .env.example):\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export function isProduction(env: Env): boolean {
  return env.APP_ENV === 'production';
}
