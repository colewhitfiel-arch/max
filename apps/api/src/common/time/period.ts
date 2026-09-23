import type { PeriodQuery } from '@edu/contracts';
import { Errors } from '../errors/app-error';
import { addDays } from './time';

/** Сколько дней показывать, если период в запросе не задан. */
export const DEFAULT_DAYS_BACK = 30;
export const DEFAULT_DAYS_FORWARD = 30;

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Период запроса (`from`/`to` — `YYYY-MM-DD`, обе границы включительно) в моменты времени.
 * `to` растягивается до конца своего дня, иначе занятия этого дня выпали бы из выборки.
 * Общий для всех календарей, чтобы у ученика, родителя и преподавателя период считался одинаково.
 */
export function periodBounds(query: PeriodQuery): { from: Date; to: Date } {
  const today = startOfUtcDay(new Date());
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : addDays(today, -DEFAULT_DAYS_BACK);
  const to = query.to
    ? new Date(`${query.to}T23:59:59.999Z`)
    : addDays(today, DEFAULT_DAYS_FORWARD + 1);
  if (to.getTime() < from.getTime()) throw Errors.validation('Конец периода раньше начала');
  return { from, to };
}
