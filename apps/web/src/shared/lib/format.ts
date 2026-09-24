/**
 * Доля 0..1 → «92%» (без пробела, как `formatPercent` и макеты); null → «—».
 * `_locale` оставлен для совместимости вызовов: формат процента одинаков для ru и en.
 */
export function formatRate(rate: number | null | undefined, _locale = 'ru'): string {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** Проценты 0..100 → «45%». */
export function formatPercent(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) return '—';
  return `${Math.round(percent)}%`;
}

/** Имя + фамилия без лишних пробелов. */
export function fullName(user: { firstName: string; lastName?: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

/** Баллы: «85 / 100». */
export function formatScore(score: number | null | undefined, maxScore: number): string {
  return score == null ? `— / ${maxScore}` : `${score} / ${maxScore}`;
}
