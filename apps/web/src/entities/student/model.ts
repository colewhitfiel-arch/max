/**
 * Краткое имя как в макете родителя: «Иванов Е.» (фамилия + инициал имени). Отчества в
 * `UserBrief` нет — в макете «Фамилия И. О.» второй инициал появится вместе с полем.
 * Без фамилии — просто имя.
 */
export function shortName(user: { firstName: string; lastName?: string | null }): string {
  const first = user.firstName.trim();
  const last = user.lastName?.trim();
  if (!last) return first;
  return first ? `${last} ${first.charAt(0).toUpperCase()}.` : last;
}
