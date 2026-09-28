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
 * (по пользователю).
 */
export type RateLimitBucket = 'auth' | 'link' | 'ai';

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
};

export const RATE_LIMIT_KEY = 'rate-limit:bucket';

/** Пусто в env — включено везде, кроме тестов (NODE_ENV=test). */
export function isRateLimitEnabled(env: Pick<Env, 'RATE_LIMIT_ENABLED' | 'NODE_ENV'>): boolean {
  return env.RATE_LIMIT_ENABLED ?? env.NODE_ENV !== 'test';
}

/**
 * IP клиента: первый адрес `X-Forwarded-For`. Заголовок ставит прокси стенда и затирает
 * присланный клиентом: Vercel — всегда, nginx из infra/nginx.conf — `$remote_addr`. Без прокси
 * (локальный dev) — адрес сокета. За другим прокси заголовок нужно перезаписывать так же,
 * иначе клиент подставит любой адрес и обойдёт лимит.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const header = req.headers['x-forwarded-for'];
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
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
