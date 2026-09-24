import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RoleSchema } from '@edu/contracts';
import { z } from 'zod';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { Errors } from '../errors/app-error';
import type { AuthUser } from './auth-user';
import { safeEqual } from './safe-equal';

const claimsSchema = z.object({
  sub: z.string(),
  mid: z.string(),
  roles: z.array(RoleSchema),
  role: RoleSchema.nullable(),
  pid: z.string().nullable(),
  iat: z.number(),
  exp: z.number(),
});

/** Разбирает TTL вида `15m`, `30d`, `12h`, `60s` в секунды. */
export function parseTtlSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!m) throw new Error(`Некорректный TTL: ${ttl}`);
  const n = Number(m[1]);
  return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

/**
 * Access JWT (HS256) на node:crypto без внешних зависимостей + opaque refresh-токены.
 * Формат стандартный (header.payload.signature), совместим с любыми JWT-инструментами.
 */
@Injectable()
export class JwtService {
  private readonly secret: Buffer;
  readonly accessTtlSec: number;
  readonly refreshTtlSec: number;

  constructor(@InjectEnv() env: Env) {
    this.secret = Buffer.from(env.JWT_SECRET, 'utf8');
    this.accessTtlSec = parseTtlSeconds(env.JWT_ACCESS_TTL);
    this.refreshTtlSec = parseTtlSeconds(env.JWT_REFRESH_TTL);
  }

  private sign(signingInput: string): string {
    return createHmac('sha256', this.secret).update(signingInput).digest('base64url');
  }

  async signAccess(
    user: AuthUser,
    nowSec: number = Math.floor(Date.now() / 1000),
  ): Promise<string> {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(
      JSON.stringify({
        sub: user.userId,
        mid: user.maxUserId,
        roles: user.roles,
        role: user.activeRole,
        pid: user.profileId,
        iat: nowSec,
        exp: nowSec + this.accessTtlSec,
      }),
    );
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${this.sign(signingInput)}`;
  }

  async verifyAccess(
    token: string,
    nowSec: number = Math.floor(Date.now() / 1000),
  ): Promise<AuthUser> {
    const parts = token.split('.');
    if (parts.length !== 3) throw Errors.unauthorized('Токен повреждён');
    const [header, payload, signature] = parts as [string, string, string];
    const expected = this.sign(`${header}.${payload}`);
    if (!safeEqual(expected, signature)) {
      throw Errors.unauthorized('Токен недействителен');
    }
    let claims: unknown;
    try {
      const head = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as {
        alg?: string;
      };
      if (head.alg !== 'HS256') throw new Error('alg');
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw Errors.unauthorized('Токен повреждён');
    }
    const parsed = claimsSchema.safeParse(claims);
    if (!parsed.success) throw Errors.unauthorized('Токен повреждён');
    const c = parsed.data;
    if (c.exp <= nowSec) throw Errors.unauthorized('Токен истёк');
    return {
      userId: c.sub,
      maxUserId: c.mid,
      roles: c.roles,
      activeRole: c.role,
      profileId: c.pid,
    };
  }

  /** Opaque refresh-токен: в БД хранится только его sha256. */
  generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      hash: JwtService.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtlSec * 1000),
    };
  }

  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
