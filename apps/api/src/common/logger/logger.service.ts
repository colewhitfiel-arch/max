import { Injectable, type LoggerService } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { getRequestContext } from './request-context';

/** Пути, которые pino вырезает из логов: токены, секреты, пароли, содержимое сообщений ИИ. */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.authKey',
  '*.secret',
  '*.apiKey',
  '*.launchParams',
  '*.messages',
  '*.content',
];

export function createRootLogger(env: Pick<Env, 'LOG_LEVEL' | 'APP_ENV' | 'NODE_ENV'>): PinoLogger {
  const pretty = env.APP_ENV === 'development' && env.NODE_ENV !== 'test';
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'api' },
    // request-id и пользователь подмешиваются в каждую запись автоматически
    mixin: () => {
      const ctx = getRequestContext();
      return ctx ? { requestId: ctx.requestId, userId: ctx.userId } : {};
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}

/**
 * Структурированный логгер (pino), совместимый с LoggerService NestJS.
 * Использование в сервисах: `private readonly log = this.logger.child({ module: 'attendance' })`.
 */
@Injectable()
export class AppLogger implements LoggerService {
  readonly pino: PinoLogger;

  constructor(@InjectEnv() env: Env) {
    this.pino = createRootLogger(env);
  }

  child(bindings: Record<string, unknown>): PinoLogger {
    return this.pino.child(bindings);
  }

  // --- LoggerService (Nest внутренние логи) ---
  log(message: unknown, context?: string): void {
    this.pino.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.pino.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.pino.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.pino.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.pino.trace({ context }, String(message));
  }
}
