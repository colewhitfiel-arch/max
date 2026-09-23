import type {
  BalancePoint,
  TeacherWallet,
  TeacherWalletPeriod,
  TeacherWalletTransaction,
} from '@edu/contracts';
import type { CardColumnsStripes } from '@edu/ui';
import { addDays, startOfDay, toDate, toDateOnly } from '@/shared/lib/dates';

/** Окно «1 день» — последние 24 часа, как данные периода; точка графика — каждый час. */
const DAY_WINDOW_HOURS = 24;
/** Подпись оси X «1 день» — каждые 4 часа по «круглым» часам (4:00 … 00:00, как в макете). */
const DAY_LABEL_STEP_HOURS = 4;
/** «30 дней»: подпись оси X — каждые 5 дней (7 подписей на 30 интервалов). */
const MONTH_LABEL_STEP_DAYS = 5;

const PERIOD_DAYS: Record<Exclude<TeacherWalletPeriod, 'day'>, number> = { week: 7, month: 30 };

export interface BalanceSeries {
  /** Баланс в рублях в равноотстоящие моменты — точки `LineChart`, слева направо. */
  values: number[];
  /**
   * Подписи оси X (равномерно, первая — у начала линии, последняя — у конца); каждая стоит
   * ровно над своей точкой: число интервалов точек кратно числу интервалов подписей.
   */
  labels: string[];
}

const time = (value: string | Date) => toDate(value).getTime();

function byTime<T extends { at: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => time(a.at) - time(b.at));
}

/**
 * Баланс (копейки) на момент `at` по ступенчатой истории: последняя точка не позже `at`;
 * раньше первой точки — первая (это баланс на начало окна). История — по возрастанию.
 */
function balanceAt(history: readonly BalancePoint[], at: number, fallback: number): number {
  let value = history[0]?.balance.amountKopecks ?? fallback;
  for (const point of history) {
    if (time(point.at) > at) break;
    value = point.balance.amountKopecks;
  }
  return value;
}

/** «4:00» … «20:00», «00:00» — полночь конца дня, как в макете. */
function hourLabel(hour: number): string {
  return hour % 24 === 0 ? '00:00' : `${hour}:00`;
}

/**
 * Конец окна «1 день»: ближайший час, кратный шагу подписей, не раньше момента расчёта —
 * подписи тогда стоят на «круглых» часах и на обоих краях оси.
 */
function dayWindowEnd(calculatedAt: number): Date {
  const end = new Date(calculatedAt);
  end.setMinutes(0, 0, 0);
  if (end.getTime() < calculatedAt) end.setHours(end.getHours() + 1);
  while (end.getHours() % DAY_LABEL_STEP_HOURS !== 0) end.setHours(end.getHours() + 1);
  return end;
}

/**
 * Точки и подписи графика «Изменение баланса» в поясе браузера. Каждая точка — баланс
 * на момент (после всех операций до него); моменты позже расчёта — текущий баланс.
 * - `day` — последние 24 часа (то же окно, что у транзакций периода) каждый час, конец — на
 *   ближайшем часе, кратном 4; подписи каждые 4 часа («8:00 … 00:00 … 8:00»);
 * - `week` — начало окна и конец каждого из 7 дней, подписи — дни недели (у начала — пусто,
 *   чтобы день недели не повторялся на обоих краях);
 * - `month` — начало окна и конец каждого из 30 дней, подписи — даты каждые 5 дней.
 */
export function balanceSeries(wallet: TeacherWallet, locale: string): BalanceSeries {
  const history = byTime(wallet.history);
  const windowStart = time(wallet.from);
  const calculatedAt = time(wallet.to);
  const current = wallet.balance.amountKopecks;
  // Внутри окна баланс точный — текущий минус операции после момента (список операций за
  // окно полный); до окна или без операций — по точкам `history` (шаг в несколько часов/дней).
  const exact = wallet.transactions.length > 0;
  const valueAt = (moment: Date) => {
    const at = moment.getTime();
    if (at >= calculatedAt) return current / 100;
    if (!exact || at < windowStart) return balanceAt(history, at, current) / 100;
    const after = wallet.transactions.reduce((sum, transaction) => {
      if (time(transaction.at) <= at) return sum;
      const amount = transaction.amount.amountKopecks;
      return sum + (transaction.kind === 'INCOME' ? amount : -amount);
    }, 0);
    return (current - after) / 100;
  };
  const today = startOfDay(wallet.to);

  if (wallet.period === 'day') {
    const end = dayWindowEnd(calculatedAt);
    const moments = Array.from({ length: DAY_WINDOW_HOURS + 1 }, (_, index) => {
      const moment = new Date(end);
      moment.setHours(end.getHours() - (DAY_WINDOW_HOURS - index));
      return moment;
    });
    return {
      values: moments.map(valueAt),
      labels: moments
        .filter((_, index) => index % DAY_LABEL_STEP_HOURS === 0)
        .map((moment) => hourLabel(moment.getHours())),
    };
  }

  const days = PERIOD_DAYS[wallet.period];
  // Момент k — полночь, которой закончился день (k − 1) окна; k = 0 — начало окна.
  const moments = Array.from({ length: days + 1 }, (_, k) => addDays(today, k - days + 1));
  const values = moments.map(valueAt);
  if (wallet.period === 'week') {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return {
      values,
      labels: moments.map((moment, k) => (k === 0 ? '' : weekday.format(addDays(moment, -1)))),
    };
  }
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: '2-digit' });
  return {
    values,
    labels: moments
      .filter((_, k) => k % MONTH_LABEL_STEP_DAYS === 0)
      .map((moment) => date.format(addDays(moment, -1))),
  };
}

/** Баланс на начало окна (первая точка истории) — для доступного названия графика. */
export function openingBalance(wallet: TeacherWallet): number {
  return byTime(wallet.history)[0]?.balance.amountKopecks ?? wallet.balance.amountKopecks;
}

export interface TransactionDay {
  /** YYYY-MM-DD в поясе браузера. */
  key: string;
  /** Полночь дня в поясе браузера. */
  date: Date;
  /** Операции дня по возрастанию времени. */
  items: TeacherWalletTransaction[];
  /** Какие строки блока подложены полосой — чередование продолжается из блока в блок. */
  stripes: CardColumnsStripes;
}

function isStriped(stripes: CardColumnsStripes, index: number): boolean {
  return stripes === 'even' ? index % 2 === 1 : index % 2 === 0;
}

/**
 * Транзакции по календарным дням (пояс браузера), дни и операции внутри — по возрастанию,
 * как в макете («вчера» над «сегодня»). Полосы чередуются через все блоки: следующий день
 * начинается с незаполненной строки, если последняя строка предыдущего заполнена (полосой
 * или красной подложкой вывода), и наоборот.
 */
export function transactionsByDay(
  transactions: readonly TeacherWalletTransaction[],
): TransactionDay[] {
  const days: TransactionDay[] = [];
  for (const transaction of byTime(transactions)) {
    const key = toDateOnly(transaction.at);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(transaction);
    else days.push({ key, date: startOfDay(transaction.at), items: [transaction], stripes: 'odd' });
  }
  for (let index = 1; index < days.length; index += 1) {
    const previous = days[index - 1]!;
    const lastIndex = previous.items.length - 1;
    const filled =
      isStriped(previous.stripes, lastIndex) || previous.items[lastIndex]!.kind === 'WITHDRAWAL';
    days[index]!.stripes = filled ? 'even' : 'odd';
  }
  return days;
}

/** DateOnly «YYYY-MM-DD» → полночь этого дня в поясе браузера (без сдвига через UTC). */
function fromDateOnly(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Дата платежа «Вам должны» в формате dd.MM.yy («24.10.26»; в en — по правилам локали). */
export function formatDueDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(fromDateOnly(value));
}

/** Платёж просрочен: дата раньше сегодняшней (в поясе браузера). */
export function isOverdue(dueAt: string, now = new Date()): boolean {
  return dueAt < toDateOnly(now);
}
