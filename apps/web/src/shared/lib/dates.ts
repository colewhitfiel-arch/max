/**
 * Даты: сервер отдаёт ISO UTC, показываем в поясе устройства (docs/02 §2.4).
 * Локаль берётся из аргумента (обычно i18n.language), по умолчанию ru; словесные подписи
 * («сегодня», «просрочено») — из common.<lng>.json на этом же языке.
 */
import { i18n } from '@/shared/i18n';

const DAY_MS = 86_400_000;

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const da = toDate(a);
  const db = toDate(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function addDays(date: string | Date, days: number): Date {
  const d = new Date(toDate(date));
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfDay(date: string | Date = new Date()): Date {
  const d = new Date(toDate(date));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Разница в календарных днях (b − a) в локальном поясе. */
export function diffCalendarDays(a: string | Date, b: string | Date): number {
  const start = startOfDay(a).getTime();
  const end = startOfDay(b).getTime();
  return Math.round((end - start) / DAY_MS);
}

export function formatTime(value: string | Date, locale = 'ru'): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    toDate(value),
  );
}

/** «21 сент.» или «21 сент. 2025», если год не текущий. */
export function formatDate(value: string | Date, locale = 'ru'): string {
  const d = toDate(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

export function formatWeekday(value: string | Date, locale = 'ru'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(toDate(value));
}

const RELATIVE_DAY_KEYS: Record<number, string> = {
  [-1]: 'dates.yesterday',
  0: 'dates.today',
  1: 'dates.tomorrow',
};

/** Словарь common на языке `locale` (а не текущем языке интерфейса). */
function commonT(locale: string) {
  return i18n.getFixedT(locale.slice(0, 2), 'common');
}

/** «сегодня» / «завтра» / «вчера» / «21 сент.». */
export function formatRelativeDay(value: string | Date, locale = 'ru', now = new Date()): string {
  const key = RELATIVE_DAY_KEYS[diffCalendarDays(now, value)];
  return key ? commonT(locale)(key) : formatDate(value, locale);
}

/** «сегодня, 15:30» / «завтра, 10:00» / «21 сент., 15:30». */
export function formatDateTime(value: string | Date, locale = 'ru', now = new Date()): string {
  return `${formatRelativeDay(value, locale, now)}, ${formatTime(value, locale)}`;
}

/** «15:00–16:30». */
export function formatTimeRange(start: string | Date, end: string | Date, locale = 'ru'): string {
  return `${formatTime(start, locale)}–${formatTime(end, locale)}`;
}

/**
 * DateOnly «YYYY-MM-DD» → полночь этого дня в поясе устройства. `new Date('2026-10-01')` — полночь
 * UTC, западнее Гринвича это ещё 30 сентября; DateOnly-поля (paidUntil, nextPaymentAt, dueAt долга)
 * — календарные дни без пояса, их разбираем только так.
 */
export function parseDateOnly(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** DateOnly в формате `formatDate`: «1 окт.» или «1 окт. 2027». */
export function formatDateOnly(value: string, locale = 'ru'): string {
  return formatDate(parseDateOnly(value), locale);
}

/** YYYY-MM-DD в локальном поясе (для query-параметров периода). */
export function toDateOnly(value: string | Date = new Date()): string {
  const d = toDate(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Период последних N дней (включая сегодня) для `?from&to`. */
export function lastDaysPeriod(days: number, now = new Date()): { from: string; to: string } {
  return { from: toDateOnly(addDays(now, -(days - 1))), to: toDateOnly(now) };
}

/** Период от сегодня на N дней вперёд. */
export function nextDaysPeriod(days: number, now = new Date()): { from: string; to: string } {
  return { from: toDateOnly(now), to: toDateOnly(addDays(now, days)) };
}

/** Дедлайн относительно сейчас: «через 2 дн.», «сегодня, 15:30», «просрочено». */
export function formatDue(value: string | Date, locale = 'ru', now = new Date()): string {
  const t = commonT(locale);
  const days = diffCalendarDays(now, value);
  if (toDate(value).getTime() < now.getTime()) return t('dates.overdue');
  if (days === 0) return t('dates.todayAt', { time: formatTime(value, locale) });
  if (days === 1) return t('dates.tomorrow');
  return t('dates.inDays', { days });
}

/** Локальное название дня недели по номеру 0..6 (как в ScheduleRuleDto.weekday). */
export function weekdayName(weekday: number, locale = 'ru'): string {
  const base = new Date(2024, 0, 7 + weekday); // 7 января 2024 — воскресенье
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(base);
}
