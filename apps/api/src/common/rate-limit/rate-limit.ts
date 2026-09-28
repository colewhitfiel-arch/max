import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import type { RequestWithUser } from '../auth/decorators';
import { Errors } from '../errors/app-error';
import { KV_STORE, type KeyValueStore } from '../kv/key-value-store';

/**
 * Группы ручек с общим счётчиком: вход и обновление сессии (по IP), привязка ребёнка по коду
 * и приглашению (по пользователю — 6-символьный код иначе перебирается), вызовы GigaChat
 * (по пользователю) и запуск генерации курса — отдельно и в час: одна задача course-builder
 * делает много вызовов GigaChat (по пользователю).
 */
export type RateLimitBucket = 'auth' | 'link' | 'ai' | 'generation';

interface BucketPolicy {
  /** Чей счётчик: IP клиента (публичные ручки) или пользователь из JWT. */
  by: 'ip' | 'user';
  windowSec: number;
  limit: (env: Env) => number;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitBucket, BucketPolicy> = {
  auth: { by: 'ip', windowSec: 60, limit: (env) => env.RATE_LIMIT_AUTH_PER_MIN },
  link: { by: 'user', windowSec: 60 * 60, limit: (env) => env.RATE_LIMIT_LINK_PER_HOUR },
  ai: { by: 'user', windowSec: 60, limit: (env) => env.RATE_LIMIT_AI_PER_MIN },
  generation: {
    by: 'user',
    windowSec: 60 * 60,
    limit: (env) => env.RATE_LIMIT_GENERATION_PER_HOUR,
  },
};

export const RATE_LIMIT_KEY = 'rate-limit:bucket';

/** Пусто в env — включено везде, кроме тестов (NODE_ENV=test). */
export function isRateLimitEnabled(env: Pick<Env, 'RATE_LIMIT_ENABLED' | 'NODE_ENV'>): boolean {
  return env.RATE_LIMIT_ENABLED ?? env.NODE_ENV !== 'test';
}

/**
 * IP клиента: последний адрес `X-Forwarded-For` — его дописывает прокси прямо перед api, а всё,
 * что левее, мог прислать сам клиент. nginx из infra/nginx.conf дописывает `$remote_addr`
 * (настоящий клиент и за доверенным TLS-прокси — модуль realip), Vercel перезаписывает
 * заголовок целиком. Без прокси (локальный dev) — адрес сокета.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const header = req.headers['x-forwarded-for'];
  const last = (Array.isArray(header) ? header.join(',') : header)
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  return last || req.socket?.remoteAddress || 'unknown';
}

/**
 * Ограничение частоты (fixed window): счётчик `rl:<группа>:<кто>:<номер окна>` атомарным `incr`
 * в KeyValueStore — при KV_DRIVER=postgres общий для всех инстансов serverless. Сверх лимита —
 * 429 RATE_LIMITED и `Retry-After` до конца окна. Метод-guard: срабатывает после AuthGuard,
 * поэтому пользователь из JWT уже известен.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    @InjectEnv() private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket = this.reflector.getAllAndOverride<RateLimitBucket | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!bucket || !isRateLimitEnabled(this.env)) return true;
    const policy = RATE_LIMIT_POLICIES[bucket];
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithUser>();
    const subject =
      policy.by === 'user' && req.user ? `user:${req.user.userId}` : `ip:${clientIp(req)}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSec / policy.windowSec);
    const count = await this.kv.incr(`rl:${bucket}:${subject}:${window}`, policy.windowSec);
    if (count <= policy.limit(this.env)) return true;
    const retryAfterSec = (window + 1) * policy.windowSec - nowSec;
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfterSec));
    throw Errors.rateLimited('Слишком много запросов — попробуйте чуть позже');
  }
}

/** Ограничить частоту вызовов ручки: `@RateLimit('ai')`; счётчик и лимит — RATE_LIMIT_POLICIES. */
export const RateLimit = (bucket: RateLimitBucket) =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, bucket), UseGuards(RateLimitGuard));
