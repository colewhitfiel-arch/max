/**
 * Кошелёк преподавателя — заглушка до PaymentProvider (docs/04, docs/07): баланс, график
 * «Изменение баланса», транзакции за период и «Вам должны». Операции живут в
 * `db.teacherWallets` (история Марии — `world-extras.ts`), вывод списывается сразу.
 */
import type {
  BalancePoint,
  Enrollment,
  Money,
  TeacherDebt,
  TeacherWallet,
  TeacherWalletPeriod,
  TeacherWalletTransaction,
} from '@edu/contracts';
import { addDays, startOfDay, toDateOnly } from '../../lib/dates';
import { groupBrief, groupsOfTeacher, studentBrief } from './demo';
import { db } from './state';
import type { MockTeacherTransaction, MockTeacherWallet } from './world-extras';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** «Вам должны»: платежи, до которых осталось не больше стольких дней (и все просроченные). */
const DEBT_HORIZON_DAYS = 45;

/**
 * Окно периода — скользящее, до «сейчас» (как в макете: «1 день» показывает и вчера, и сегодня):
 * день — 24 часа, точки графика каждые 4 часа (7 точек); 7 и 30 дней — точки по дням (8 и 31).
 */
const WINDOWS: Record<TeacherWalletPeriod, { stepMs: number; steps: number }> = {
  day: { stepMs: 4 * HOUR_MS, steps: 6 },
  week: { stepMs: DAY_MS, steps: 7 },
  month: { stepMs: DAY_MS, steps: 30 },
};

export const rub = (amountKopecks: number): Money => ({ amountKopecks, currency: 'RUB' });

/** Кошелёк преподавателя; у нового — пустой (баланс 0, операций нет). */
export function teacherWalletOf(teacherId: string): MockTeacherWallet {
  let wallet = db.teacherWallets.get(teacherId);
  if (!wallet) {
    wallet = { openingKopecks: 0, transactions: [] };
    db.teacherWallets.set(teacherId, wallet);
  }
  return wallet;
}

const signed = (tx: MockTeacherTransaction) =>
  tx.kind === 'INCOME' ? tx.amountKopecks : -tx.amountKopecks;

/** Баланс на момент `at` (включая операции в этот момент), в копейках. */
export function walletBalance(wallet: MockTeacherWallet, at = new Date()): number {
  const t = at.getTime();
  return wallet.transactions
    .filter((tx) => new Date(tx.at).getTime() <= t)
    .reduce((sum, tx) => sum + signed(tx), wallet.openingKopecks);
}

export function transactionDto(tx: MockTeacherTransaction): TeacherWalletTransaction {
  return {
    id: tx.id,
    kind: tx.kind,
    amount: rub(tx.amountKopecks),
    at: tx.at,
    group: tx.groupId ? groupBrief(tx.groupId) : null,
    student: tx.studentId ? studentBrief(tx.studentId) : null,
  };
}

/** YYYY-MM-DD как локальная дата (без сдвига UTC-полуночи в западных поясах). */
export function fromDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Дата следующего платежа по зачислению: день после последнего оплаченного периода; ничего не
 * оплачено — первый платёж был в день зачисления (в демо такие долги просрочены). Общая для
 * «Вам должны» преподавателя и `nextPaymentAt` родителя — даты у ролей не расходятся.
 */
export function nextPaymentDate(enrollment: Enrollment): Date {
  const paidEnd = db.paidPeriods
    .filter((p) => p.enrollmentId === enrollment.id)
    .map((p) => p.periodEnd)
    .sort()
    .at(-1);
  return paidEnd ? addDays(fromDateOnly(paidEnd), 1) : startOfDay(enrollment.enrolledAt);
}

/**
 * «Вам должны»: активные зачисления в группы преподавателя, у которых следующий платёж просрочен
 * или наступит в ближайшие 45 дней; сумма — цена периода кружка. По возрастанию даты.
 */
export function teacherDebts(teacherId: string, now = new Date()): TeacherDebt[] {
  const horizon = addDays(startOfDay(now), DEBT_HORIZON_DAYS).getTime();
  return groupsOfTeacher(teacherId)
    .flatMap((group) => {
      const club = db.clubs.find((c) => c.id === group.clubId);
      if (!club) return [];
      return db.enrollments
        .filter((e) => e.groupId === group.id && e.status === 'ACTIVE')
        .map((e) => ({ enrollment: e, due: nextPaymentDate(e), price: club.price }));
    })
    .filter(({ due }) => due.getTime() <= horizon)
    .sort(
      (a, b) => a.due.getTime() - b.due.getTime() || a.enrollment.id.localeCompare(b.enrollment.id),
    )
    .map(({ enrollment, due, price }) => ({
      id: enrollment.id,
      group: groupBrief(enrollment.groupId),
      student: studentBrief(enrollment.studentId),
      amount: price,
      dueAt: toDateOnly(due),
    }));
}

/**
 * Кошелёк за период: `history` — равномерные точки от `from` до `to` (последняя — текущий
 * баланс), `transactions` — операции в (from, to] по убыванию времени.
 */
export function teacherWalletDto(
  teacherId: string,
  period: TeacherWalletPeriod,
  now = new Date(),
): TeacherWallet {
  const wallet = teacherWalletOf(teacherId);
  const { stepMs, steps } = WINDOWS[period];
  const from = new Date(now.getTime() - stepMs * steps);
  const history: BalancePoint[] = Array.from({ length: steps + 1 }, (_, k) => {
    const at = k === steps ? now : new Date(from.getTime() + stepMs * k);
    return { at: at.toISOString(), balance: rub(walletBalance(wallet, at)) };
  });
  const transactions = wallet.transactions
    .filter((tx) => {
      const t = new Date(tx.at).getTime();
      return t > from.getTime() && t <= now.getTime();
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .map(transactionDto);
  return {
    balance: rub(walletBalance(wallet, now)),
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    history,
    transactions,
    debts: teacherDebts(teacherId, now),
  };
}
