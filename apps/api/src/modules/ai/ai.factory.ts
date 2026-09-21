import {
  type AiConfig,
  type AiLogger,
  AiService,
  createAiService,
  productMockRules,
} from '@edu/ai';
import type { Logger } from 'pino';
import { type Env } from '../../config/env';

/** AiLogger поверх pino: содержимое сообщений и ключи в логи не попадают (см. @edu/ai/logger). */
export function pinoAiLogger(log: Logger): AiLogger {
  return {
    debug: (msg, meta) => log.debug(meta ?? {}, msg),
    info: (msg, meta) => log.info(meta ?? {}, msg),
    warn: (msg, meta) => log.warn(meta ?? {}, msg),
    error: (msg, meta) => log.error(meta ?? {}, msg),
  };
}

export function aiConfigFromAppEnv(env: Env): AiConfig {
  // Mock отвечает детерминированным JSON по каждому продуктовому промпту (dev без сети, тесты).
  if (env.AI_PROVIDER === 'mock')
    return { provider: 'mock', mock: { responses: productMockRules } };
  return {
    provider: 'gigachat',
    gigachat: {
      authKey: env.GIGACHAT_AUTH_KEY ?? '',
      scope: env.GIGACHAT_SCOPE,
      model: env.GIGACHAT_MODEL,
      oauthUrl: env.GIGACHAT_OAUTH_URL,
      apiUrl: env.GIGACHAT_API_URL,
      timeoutMs: env.GIGACHAT_TIMEOUT_MS,
      maxRetries: env.GIGACHAT_MAX_RETRIES,
      ...(env.GIGACHAT_CA_CERT_PATH ? { caCertPath: env.GIGACHAT_CA_CERT_PATH } : {}),
    },
  };
}

/** Единственная точка создания AiService в приложении. Модули получают AiService через DI. */
export function buildAiService(env: Env, log: Logger): AiService {
  return createAiService(aiConfigFromAppEnv(env), { logger: pinoAiLogger(log) });
}
