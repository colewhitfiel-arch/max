import { describe, expect, it } from 'vitest';
import { JwtService, parseTtlSeconds } from '../../src/common/auth/jwt.service';
import { testEnv } from '../helpers/env';

describe('JwtService', () => {
  const jwt = new JwtService(testEnv({ JWT_ACCESS_TTL: '1h' }));

  it('парсит TTL', () => {
    expect(parseTtlSeconds('15m')).toBe(900);
    expect(parseTtlSeconds('30d')).toBe(30 * 86400);
    expect(() => parseTtlSeconds('abc')).toThrow();
  });

  it('подписывает и проверяет access-токен', async () => {
    const user = {
      userId: 'u1',
      maxUserId: 'm1',
      roles: ['TEACHER', 'PARENT'] as const,
      activeRole: 'TEACHER' as const,
      profileId: 'p1',
    };
    const token = await jwt.signAccess({ ...user, roles: [...user.roles] });
    const parsed = await jwt.verifyAccess(token);
    expect(parsed).toEqual({ ...user, roles: [...user.roles] });
  });

  it('отклоняет токен с другим секретом', async () => {
    const other = new JwtService(testEnv({ JWT_SECRET: 'another-secret-another-secret-32chars!' }));
    const token = await other.signAccess({
      userId: 'u',
      maxUserId: 'm',
      roles: [],
      activeRole: null,
      profileId: null,
    });
    await expect(jwt.verifyAccess(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('истёкший токен отклоняется', async () => {
    const token = await jwt.signAccess(
      { userId: 'u', maxUserId: 'm', roles: [], activeRole: null, profileId: null },
      1000,
    );
    await expect(jwt.verifyAccess(token, 1000 + 3600)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(jwt.verifyAccess(token, 1000 + 10)).resolves.toMatchObject({ userId: 'u' });
  });

  it('refresh-токен хэшируется детерминированно', () => {
    const { token, hash } = jwt.generateRefreshToken();
    expect(hash).toBe(JwtService.hashRefreshToken(token));
    expect(hash).not.toBe(token);
  });
});
