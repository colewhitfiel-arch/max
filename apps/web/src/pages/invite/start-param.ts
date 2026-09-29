import { parseChildInviteStartParam } from '@edu/contracts';

/**
 * Экран приглашения для полезной нагрузки диплинка MAX (`startapp=invite_<token>` →
 * `/invite/<token>`); null — это не приглашение или токен битый.
 */
export function invitePathFromStartParam(startParam: string | null | undefined): string | null {
  const token = parseChildInviteStartParam(startParam);
  return token ? `/invite/${token}` : null;
}
