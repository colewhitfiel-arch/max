import type { ExternalIdentity } from './auth-user';

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export type AuthProviderInput =
  | { kind: 'max'; launchParams: string }
  | { kind: 'dev'; maxUserId: string; firstName?: string; lastName?: string };

/**
 * Порт аутентификации: превращает входные данные (launch-параметры MAX или dev-вход)
 * в подтверждённую внешнюю личность. Реализации: DevAuthProvider, MaxAuthProvider.
 */
export interface AuthProvider {
  readonly name: 'dev' | 'max';
  verify(input: AuthProviderInput): Promise<ExternalIdentity>;
}
