/**
 * Время: в БД UTC, границы «сегодня/неделя» — в часовом поясе школы.
 * Без внешних библиотек: Intl достаточно для смещений.
 */

/** Смещение зоны в минутах для момента времени (например, Europe/Moscow → 180). */
export function tzOffsetMinutes(timezone: string, at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Начало и конец календарного дня в зоне школы (UTC-моменты). */
export function dayBounds(timezone: string, at: Date = new Date()): { start: Date; end: Date } {
  const offset = tzOffsetMinutes(timezone, at);
  const local = new Date(at.getTime() + offset * 60_000);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocal - offset * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Дата `YYYY-MM-DD` в зоне школы. */
export function toDateOnly(timezone: string, at: Date = new Date()): string {
  const offset = tzOffsetMinutes(timezone, at);
  return new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Начало календарной недели (понедельник) в зоне школы — UTC-момент. */
export function weekStart(timezone: string, at: Date = new Date()): Date {
  const { start } = dayBounds(timezone, at);
  const offset = tzOffsetMinutes(timezone, start);
  // День недели считается по локальной дате, иначе у отрицательных смещений неделя съезжает.
  const localWeekday = new Date(start.getTime() + offset * 60_000).getUTCDay();
  return addDays(start, -((localWeekday + 6) % 7));
}
