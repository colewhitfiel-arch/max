/** Доля 0..1 → «92%»; null → «—». */
export function formatRate(rate: number | null | undefined, locale = 'ru'): string {
  if (rate == null || Number.isNaN(rate)) return '—';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(rate);
}

/** Проценты 0..100 → «45%». */
export function formatPercent(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) return '—';
  return `${Math.round(percent)}%`;
}

/** Дельта доли → «+5%» / «−3%» / «0%». */
export function formatDelta(delta: number | null | undefined): string {
  if (delta == null || Number.isNaN(delta)) return '—';
  const value = Math.round(delta * 100);
  if (value === 0) return '0%';
  return `${value > 0 ? '+' : '−'}${Math.abs(value)}%`;
}

/**
 * Склонение по числу (ru): plural(3, ['задание', 'задания', 'заданий']) → «задания».
 * Для en вторая форма используется для всех, кроме 1.
 */
export function plural(n: number, forms: [string, string, string], locale = 'ru'): string {
  if (!locale.startsWith('ru')) return n === 1 ? forms[0] : forms[1];
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/** «3 задания». */
export function formatCount(n: number, forms: [string, string, string], locale = 'ru'): string {
  return `${n} ${plural(n, forms, locale)}`;
}

/** Имя + фамилия без лишних пробелов. */
export function fullName(user: { firstName: string; lastName?: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

/** Баллы: «85 / 100». */
export function formatScore(score: number | null | undefined, maxScore: number): string {
  return score == null ? `— / ${maxScore}` : `${score} / ${maxScore}`;
}
