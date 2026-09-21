import { z } from 'zod';
import type { AiLogger } from './logger';
import type { AiProvider } from './provider';
import {
  GigaChatProvider,
  type FetchLike,
  type GigaChatProviderOptions,
} from './providers/gigachat';
import { MockAiProvider, type MockAiProviderOptions } from './providers/mock';

export type AiProviderKind = 'mock' | 'gigachat';

/** Часть опций GigaChat, которая задаётся конфигом/окружением (без инъекций fetch/logger/часов). */
export type GigaChatConfig = Omit<GigaChatProviderOptions, 'fetch' | 'logger' | 'now' | 'uuid'>;

export interface AiConfig {
  provider: AiProviderKind;
  gigachat?: GigaChatConfig;
  mock?: MockAiProviderOptions;
}

export interface CreateAiProviderDeps {
  logger?: AiLogger;
  /** Подмена сети (тесты, MSW). */
  fetch?: FetchLike;
}

/** Фабрика провайдера по конфигу. Единственное место, где упоминаются конкретные адаптеры. */
export function createAiProvider(config: AiConfig, deps: CreateAiProviderDeps = {}): AiProvider {
  switch (config.provider) {
    case 'mock':
      return new MockAiProvider(config.mock);
    case 'gigachat': {
      if (!config.gigachat?.authKey) {
        throw new Error('AI_PROVIDER=gigachat: не задан GIGACHAT_AUTH_KEY');
      }
      const options: GigaChatProviderOptions = { ...config.gigachat };
      if (deps.logger) options.logger = deps.logger;
      if (deps.fetch) options.fetch = deps.fetch;
      return new GigaChatProvider(options);
    }
    default: {
      const unknown: never = config.provider;
      throw new Error(`Неизвестный AI_PROVIDER: ${String(unknown)}`);
    }
  }
}

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Переменные окружения секции GigaChat из `.env.example`. Пустые строки считаются незаданными. */
export const AiEnvSchema = z.object({
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'gigachat']).default('mock')),
  GIGACHAT_AUTH_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GIGACHAT_SCOPE: z.preprocess(emptyToUndefined, z.string().optional()),
  GIGACHAT_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  GIGACHAT_OAUTH_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  GIGACHAT_API_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  GIGACHAT_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  GIGACHAT_MAX_RETRIES: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  GIGACHAT_CA_CERT_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
});
export type AiEnv = z.infer<typeof AiEnvSchema>;

/**
 * Собирает `AiConfig` из окружения (`process.env` или его подмножества).
 * Бросает `ZodError` при невалидных значениях; отсутствие ключа при `gigachat` проверяется в фабрике.
 */
export function aiConfigFromEnv(env: Record<string, string | undefined>): AiConfig {
  const parsed = AiEnvSchema.parse(env);
  if (parsed.AI_PROVIDER === 'mock') return { provider: 'mock' };

  const gigachat: GigaChatConfig = { authKey: parsed.GIGACHAT_AUTH_KEY ?? '' };
  if (parsed.GIGACHAT_SCOPE) gigachat.scope = parsed.GIGACHAT_SCOPE;
  if (parsed.GIGACHAT_MODEL) gigachat.model = parsed.GIGACHAT_MODEL;
  if (parsed.GIGACHAT_OAUTH_URL) gigachat.oauthUrl = parsed.GIGACHAT_OAUTH_URL;
  if (parsed.GIGACHAT_API_URL) gigachat.apiUrl = parsed.GIGACHAT_API_URL;
  if (parsed.GIGACHAT_TIMEOUT_MS !== undefined) gigachat.timeoutMs = parsed.GIGACHAT_TIMEOUT_MS;
  if (parsed.GIGACHAT_MAX_RETRIES !== undefined) gigachat.maxRetries = parsed.GIGACHAT_MAX_RETRIES;
  if (parsed.GIGACHAT_CA_CERT_PATH) gigachat.caCertPath = parsed.GIGACHAT_CA_CERT_PATH;
  return { provider: 'gigachat', gigachat };
}
