import type { Money } from '@edu/contracts';

/** Копейки → «3 500 ₽». Копейки показываем только если они ненулевые. */
export function formatMoney(money: Money | number, locale = 'ru'): string {
  const kopecks = typeof money === 'number' ? money : money.amountKopecks;
  const currency = typeof money === 'number' ? 'RUB' : money.currency;
  const rubles = kopecks / 100;
  const hasKopecks = kopecks % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: hasKopecks ? 2 : 0,
  }).format(rubles);
}

export function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

/**
 * Баланс целыми рублями, как в макетах кошелька («6700»): копейки не показываем, разряды
 * отделяем только от 10 000 («16 700») — четырёхзначная сумма читается и так.
 */
export function wholeRubles(money: Money | number, locale = 'ru'): string {
  const kopecks = typeof money === 'number' ? money : money.amountKopecks;
  const rubles = Math.floor(kopecks / 100);
  return new Intl.NumberFormat(locale, { useGrouping: Math.abs(rubles) >= 10_000 }).format(rubles);
}
