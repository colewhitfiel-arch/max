import type { TeacherWallet, TeacherWalletTransaction } from '@edu/contracts';
import { describe, expect, it } from 'vitest';
import { withWithdrawal } from '@/entities/payment';
import {
  balanceSeries,
  formatDueDate,
  isOverdue,
  openingBalance,
  transactionsByDay,
} from './model';

/** Локальное время браузера → ISO (модель считает дни в поясе браузера). */
const local = (day: number, hours = 0, minutes = 0, month = 9) =>
  new Date(2026, month - 1, day, hours, minutes).toISOString();
const rub = (rubles: number) => ({ amountKopecks: rubles * 100, currency: 'RUB' as const });

function wallet(overrides: Partial<TeacherWallet>): TeacherWallet {
  return {
    balance: rub(6700),
    period: 'day',
    from: local(23),
    to: local(23, 18),
    history: [],
    transactions: [],
    debts: [],
    ...overrides,
  };
}

function transaction(
  key: string,
  at: string,
  kind: TeacherWalletTransaction['kind'] = 'INCOME',
): TeacherWalletTransaction {
  return {
    id: `0190a000-0000-7000-8000-${key.padStart(12, '0')}`,
    kind,
    amount: rub(1000),
    at,
    group: null,
    student: null,
  };
}

describe('balanceSeries', () => {
  it('1 день: последние 24 часа каждый час по ступенчатой истории, подписи на «круглых» часах', () => {
    const series = balanceSeries(
      wallet({
        from: local(22, 18),
        to: local(23, 18),
        history: [
          { at: local(22, 18), balance: rub(2700) },
          { at: local(23, 10), balance: rub(5200) },
          { at: local(23, 16, 30), balance: rub(6700) },
        ],
      }),
      'ru',
    );
    // Расчёт в 18:00 → окно до ближайших 20:00, с 20:00 вчера.
    expect(series.labels).toEqual(['20:00', '00:00', '4:00', '8:00', '12:00', '16:00', '20:00']);
    expect(series.values).toHaveLength(25);
    // Вчера 20:00 … сегодня 9:00 — баланс на начало окна; с 10:00 — после поступления;
    // с 17:00 — текущий; позже расчёта — тоже текущий.
    expect(series.values.slice(0, 14).every((value) => value === 2700)).toBe(true);
    expect(series.values[14]).toBe(5200);
    expect(series.values[20]).toBe(5200);
    expect(series.values[21]).toBe(6700);
    expect(series.values.at(-1)).toBe(6700);
  });

  it('1 день утром: окно захватывает вчерашние операции, график не плоский', () => {
    const series = balanceSeries(
      wallet({
        from: local(22, 4, 30),
        to: local(23, 4, 30),
        history: [
          { at: local(22, 4, 30), balance: rub(6588) },
          { at: local(22, 12, 30), balance: rub(13588) },
          { at: local(22, 20, 30), balance: rub(6700) },
        ],
      }),
      'ru',
    );
    expect(series.labels).toEqual(['8:00', '12:00', '16:00', '20:00', '00:00', '4:00', '8:00']);
    expect(Math.max(...series.values)).toBe(13588);
    expect(series.values.at(-1)).toBe(6700);
  });

  it('внутри окна баланс считается по операциям точно до часа, а не по шагу history', () => {
    const series = balanceSeries(
      wallet({
        from: local(22, 4, 30),
        to: local(23, 4, 30),
        history: [
          { at: local(22, 4, 30), balance: rub(4700) },
          { at: local(23, 0, 30), balance: rub(6700) },
        ],
        transactions: [
          transaction('1', local(22, 10)),
          transaction('2', local(22, 17)),
          transaction('3', local(22, 19)),
        ],
      }),
      'ru',
    );
    // Моменты: вчера 8:00, 9:00, …; каждое поступление +1000 ровно в свой час.
    expect(series.values[0]).toBe(3700); // 8:00 — до всех трёх операций: 6700 − 3000
    expect(series.values[1]).toBe(3700); // 9:00
    expect(series.values[2]).toBe(4700); // 10:00 — после первой
    expect(series.values[8]).toBe(4700); // 16:00
    expect(series.values[9]).toBe(5700); // 17:00 — после второй
    expect(series.values[11]).toBe(6700); // 19:00 — после третьей
  });

  it('сразу после вывода (до перезапроса) линия не уезжает вниз: падает только текущий баланс', () => {
    const before = wallet({
      from: local(22, 18),
      to: local(23, 18),
      history: [{ at: local(22, 18), balance: rub(5700) }],
      transactions: [transaction('1', local(23, 10))],
    });
    // Вывод «Всё» после расчёта кошелька: сервер отдал новый баланс и саму операцию.
    const result = {
      balance: rub(0),
      transaction: { ...transaction('9', local(23, 18, 5), 'WITHDRAWAL'), amount: rub(6700) },
    };
    const patched = withWithdrawal(before, result);
    expect(patched.transactions.map(({ id }) => id)).toEqual([
      result.transaction.id,
      before.transactions[0]!.id,
    ]);
    // Повтор с тем же ключом — та же операция, второй раз не добавляется.
    expect(withWithdrawal(patched, result).transactions).toHaveLength(2);

    const was = balanceSeries(before, 'ru').values;
    const now = balanceSeries(patched, 'ru').values;
    // Окно до 20:00, момент расчёта 18:00 — точка 22; до неё всё как было (5700 → 6700).
    expect(now.slice(0, 22)).toEqual(was.slice(0, 22));
    expect(now.slice(22)).toEqual([0, 0, 0]);
    expect(Math.min(...now)).toBe(0);
  });

  it('7 дней: начало окна и конец каждого дня, подписи — дни недели; будущее — текущий баланс', () => {
    const series = balanceSeries(
      wallet({
        period: 'week',
        from: local(17),
        to: local(23, 12),
        history: [
          { at: local(17), balance: rub(1000) },
          { at: local(20, 15), balance: rub(4000) },
          { at: local(23, 12), balance: rub(6700) },
        ],
      }),
      'ru',
    );
    // 23.09.2026 — среда.
    expect(series.labels).toEqual(['', 'чт', 'пт', 'сб', 'вс', 'пн', 'вт', 'ср']);
    expect(series.values).toEqual([1000, 1000, 1000, 1000, 4000, 4000, 4000, 6700]);
  });

  it('30 дней: 31 точка, подписи дат через 5 дней от начала окна до сегодня', () => {
    const series = balanceSeries(
      wallet({ period: 'month', from: local(25, 0, 0, 8), to: local(23, 12) }),
      'ru',
    );
    expect(series.values).toHaveLength(31);
    expect(series.labels).toEqual(['24.08', '29.08', '3.09', '8.09', '13.09', '18.09', '23.09']);
    // Без истории — ровная линия на текущем балансе.
    expect(new Set(series.values)).toEqual(new Set([6700]));
  });

  it('баланс на начало окна — первая точка истории, без истории — текущий', () => {
    expect(
      openingBalance(
        wallet({
          history: [
            { at: local(23, 10), balance: rub(5200) },
            { at: local(23), balance: rub(2700) },
          ],
        }),
      ),
    ).toBe(270_000);
    expect(openingBalance(wallet({}))).toBe(670_000);
  });
});

describe('transactionsByDay', () => {
  it('раскладывает по календарным дням по возрастанию и продолжает «зебру» из блока в блок', () => {
    const days = transactionsByDay([
      transaction('6', local(23, 17)),
      transaction('5', local(23, 10)),
      transaction('4', local(22, 19), 'WITHDRAWAL'),
      transaction('3', local(22, 17, 28)),
      transaction('2', local(22, 17)),
      transaction('1', local(22, 10)),
      transaction('0', local(21, 9)),
    ]);
    expect(days.map((day) => day.key)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
    expect(days[1]!.items.map((item) => item.id.slice(-1))).toEqual(['1', '2', '3', '4']);
    // 21.09: одна строка с полосой → 22.09 с незаполненной; её последняя — красный вывод →
    // 23.09 снова с незаполненной (как «вчера» / «сегодня» в макете).
    expect(days.map((day) => day.stripes)).toEqual(['odd', 'even', 'even']);
  });

  it('без заливки в конце блока следующий начинается с полосы', () => {
    const days = transactionsByDay([
      transaction('1', local(22, 10)),
      transaction('2', local(22, 11)),
      transaction('3', local(23, 10)),
    ]);
    expect(days.map((day) => day.stripes)).toEqual(['odd', 'odd']);
    expect(transactionsByDay([])).toEqual([]);
  });
});

describe('даты «Вам должны»', () => {
  it('dd.MM.yy и просрочка относительно сегодняшнего дня', () => {
    expect(formatDueDate('2026-10-24', 'ru')).toBe('24.10.26');
    expect(formatDueDate('2026-11-01', 'ru')).toBe('01.11.26');
    const now = new Date(2026, 8, 23, 23, 59);
    expect(isOverdue('2026-09-22', now)).toBe(true);
    expect(isOverdue('2026-09-23', now)).toBe(false);
    expect(isOverdue('2026-10-01', now)).toBe(false);
  });
});
