/** Группа только что создана: её экран сразу открывает «Пригласить учеников». */
export const OPEN_INVITE_STATE = { openInvite: true } as const;

export function shouldOpenInvite(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'openInvite' in state;
}
