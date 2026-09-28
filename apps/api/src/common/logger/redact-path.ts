/**
 * Сегменты пути, которые сами являются секретом: токен приглашения родителя (одноразовая
 * ссылка на 7 дней) и подписанная локальная ссылка на файл. В лог путь пишется без них
 * (CLAUDE.md, правило 9).
 */
const SECRET_SEGMENTS = [/(\/parent-invites\/)[^/?#]+/, /(\/files\/local\/)[^/?#]+/];

/** Путь запроса для лога: `/api/v1/student/parent-invites/<токен>/accept` → `…/[redacted]/accept`. */
export function redactPath(path: string): string {
  return SECRET_SEGMENTS.reduce((acc, re) => acc.replace(re, '$1[redacted]'), path);
}
