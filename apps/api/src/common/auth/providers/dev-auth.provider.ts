import { Injectable } from '@nestjs/common';
import { demoUsers } from '@edu/contracts/fixtures';
import { Errors } from '../../errors/app-error';
import { type AuthProvider, type AuthProviderInput } from '../auth-provider';
import type { ExternalIdentity } from '../auth-user';

/**
 * Dev-вход: доверяет переданному maxUserId. Известные демо-пользователи берутся из фикстур,
 * неизвестные — создаются с переданным именем. Включается только при AUTH_PROVIDER=dev.
 */
@Injectable()
export class DevAuthProvider implements AuthProvider {
  readonly name = 'dev' as const;

  async verify(input: AuthProviderInput): Promise<ExternalIdentity> {
    if (input.kind !== 'dev') throw Errors.unauthorized('Dev-провайдер принимает только dev-вход');
    const known = Object.values(demoUsers).find((u) => u.maxUserId === input.maxUserId);
    if (known) {
      return {
        maxUserId: known.maxUserId,
        firstName: known.firstName,
        lastName: known.lastName,
        nickname: known.nickname,
        avatarUrl: known.avatarUrl,
        locale: known.locale,
      };
    }
    return {
      maxUserId: input.maxUserId,
      firstName: input.firstName ?? 'Dev',
      lastName: input.lastName ?? null,
      nickname: null,
      avatarUrl: null,
      locale: 'ru',
    };
  }
}
