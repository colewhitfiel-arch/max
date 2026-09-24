// @vitest-environment node
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import {
  buildTeacherWallets,
  buildTutorPayments,
  DEMO_TEACHER_WALLET_KOPECKS,
  DEMO_TEACHER_WITHDRAWAL_KOPECKS,
  type MockTeacherWallet,
} from './world-extras';

/** Операции по времени и баланс после каждой. */
function replay(wallet: MockTeacherWallet) {
  let balance = wallet.openingKopecks;
  return [...wallet.transactions]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((tx) => {
      balance += tx.kind === 'INCOME' ? tx.amountKopecks : -tx.amountKopecks;
      return { tx, balance };
    });
}

describe('кошелёк Марии-преподавателя (мок-мир)', () => {
  // Утро (сегодняшние поступления ещё впереди), день, вечер после 19:00, почти полночь.
  const moments = ['03:00', '10:30', '15:00', '17:30', '19:30', '23:59'];

  it.each(moments)('в %s: баланс 6 700 ₽, нигде не в минусе, всё в прошлом', (time) => {
    const [h, m] = time.split(':').map(Number) as [number, number];
    const now = new Date(2026, 8, 23, h, m);
    const wallet = buildTeacherWallets(now).get(DEMO_IDS.teachers.maria)!;
    const steps = replay(wallet);

    expect(wallet.openingKopecks).toBeGreaterThanOrEqual(0);
    expect(steps.at(-1)?.balance).toBe(DEMO_TEACHER_WALLET_KOPECKS);
    expect(steps.every((step) => step.balance >= 0)).toBe(true);
    expect(steps.every((step) => new Date(step.tx.at) <= now)).toBe(true);
    expect(steps.every((step) => step.tx.amountKopecks > 0)).toBe(true);
    expect(new Set(wallet.transactions.map((tx) => tx.id)).size).toBe(wallet.transactions.length);

    // Вчера в 19:00 — вывод 12 388 ₽ из макета; у выводов нет группы и ученика.
    const yesterday = new Date(2026, 8, 22, 19, 0).toISOString();
    expect(
      wallet.transactions.find((tx) => tx.kind === 'WITHDRAWAL' && tx.at === yesterday),
    ).toMatchObject({ amountKopecks: DEMO_TEACHER_WITHDRAWAL_KOPECKS, groupId: null });
    for (const tx of wallet.transactions) {
      if (tx.kind === 'INCOME') expect(tx.groupId && tx.studentId).toBeTruthy();
      else expect([tx.groupId, tx.studentId]).toEqual([null, null]);
    }
  });

  it('поступления — не раньше зачисления и по цене кружка; последнее из них оплачено на 30 дней', () => {
    const now = new Date(2026, 8, 23, 16, 0);
    const wallet = buildTeacherWallets(now).get(DEMO_IDS.teachers.maria)!;
    const enrolledAt = '2026-09-01T00:00:00.000Z';
    const incomes = wallet.transactions.filter((tx) => tx.kind === 'INCOME');
    expect(incomes.every((tx) => tx.at >= enrolledAt)).toBe(true);
    const price = { [DEMO_IDS.groups.roboticsA]: 350_000, [DEMO_IDS.groups.programmingA]: 300_000 };
    expect(incomes.every((tx) => tx.amountKopecks === price[tx.groupId!])).toBe(true);

    const { payments, paidPeriods } = buildTutorPayments(wallet);
    // Робототехника Алексея оплачена в фикстурах — вторую оплату не придумываем.
    expect(payments.map((p) => p.enrollmentId).sort()).toEqual(
      [DEMO_IDS.enrollments.dashaRobotics, DEMO_IDS.enrollments.alexeyProgramming].sort(),
    );
    // Сегодня в 10:00 заплатила Даша: оплачено с сегодня по 22.10, следующий платёж 23.10.
    const dasha = payments.find((p) => p.enrollmentId === DEMO_IDS.enrollments.dashaRobotics)!;
    expect(dasha).toMatchObject({
      status: 'SUCCEEDED',
      paidAt: new Date(2026, 8, 23, 10, 0).toISOString(),
      amount: { amountKopecks: 350_000 },
    });
    expect(paidPeriods.find((p) => p.paymentId === dasha.id)).toMatchObject({
      periodStart: '2026-09-23',
      periodEnd: '2026-10-22',
    });
  });

  it('детерминирован: тот же момент — та же история', () => {
    const now = new Date(2026, 8, 23, 12, 0);
    expect(buildTeacherWallets(now)).toEqual(buildTeacherWallets(now));
  });
});
