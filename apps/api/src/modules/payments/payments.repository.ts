import { Injectable } from '@nestjs/common';
import type { PaymentStatus } from '@edu/contracts';
import { type Prisma, type Payment } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PaymentRow = Payment;

export interface CreatePaymentData {
  parentId: string;
  studentId: string;
  enrollmentId: string;
  amountKopecks: number;
  currency: string;
  provider: string;
  periodsCount: number;
  idempotencyKey: string;
}

/**
 * Таблицы payments, paid_periods, parent_wallets, teacher_wallet_transactions.
 * Только этот модуль (AGENT_GUIDE §4).
 */
@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- платежи ----------

  create(data: CreatePaymentData): Promise<PaymentRow> {
    return this.prisma.payment.create({ data });
  }

  findById(paymentId: string): Promise<PaymentRow | null> {
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<PaymentRow | null> {
    return this.prisma.payment.findUnique({ where: { idempotencyKey } });
  }

  findByProviderId(providerPaymentId: string): Promise<PaymentRow | null> {
    return this.prisma.payment.findUnique({ where: { providerPaymentId } });
  }

  listByParent(
    parentId: string,
    filter: { studentId?: string; before?: { createdAt: Date; id: string } },
    limit: number,
  ): Promise<PaymentRow[]> {
    return this.prisma.payment.findMany({
      where: {
        parentId,
        ...(filter.studentId ? { studentId: filter.studentId } : {}),
        ...(filter.before
          ? {
              OR: [
                { createdAt: { lt: filter.before.createdAt } },
                { createdAt: filter.before.createdAt, id: { lt: filter.before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  updateProviderData(
    paymentId: string,
    data: { providerPaymentId: string; confirmationUrl: string | null },
  ): Promise<PaymentRow> {
    return this.prisma.payment.update({ where: { id: paymentId }, data });
  }

  markFailed(paymentId: string, failReason: string | null, raw: unknown): Promise<PaymentRow> {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'FAILED' satisfies PaymentStatus,
        failReason,
        raw: (raw ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Оплата прошла: статус, оплаченные периоды и поступление преподавателю — одной транзакцией.
   * Идемпотентно: если платёж уже SUCCEEDED, ничего не делает и возвращает `null`.
   */
  async settle(input: {
    paymentId: string;
    enrollmentId: string;
    periods: Array<{ periodStart: Date; periodEnd: Date }>;
    paidAt: Date;
    raw: unknown;
    teacherIncome: {
      teacherId: string;
      groupId: string;
      studentId: string;
      amountKopecks: number;
      currency: string;
    } | null;
  }): Promise<PaymentRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: input.paymentId, status: { not: 'SUCCEEDED' } },
        data: {
          status: 'SUCCEEDED',
          paidAt: input.paidAt,
          failReason: null,
          raw: (input.raw ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      if (updated.count === 0) return null;
      await tx.paidPeriod.createMany({
        data: input.periods.map((period) => ({
          enrollmentId: input.enrollmentId,
          paymentId: input.paymentId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        })),
      });
      if (input.teacherIncome) {
        await tx.teacherWalletTransaction.create({
          data: {
            teacherId: input.teacherIncome.teacherId,
            kind: 'INCOME',
            amountKopecks: input.teacherIncome.amountKopecks,
            currency: input.teacherIncome.currency,
            groupId: input.teacherIncome.groupId,
            studentId: input.teacherIncome.studentId,
            paymentId: input.paymentId,
            at: input.paidAt,
          },
        });
      }
      return tx.payment.findUnique({ where: { id: input.paymentId } });
    });
  }

  // ---------- оплаченные периоды ----------

  /** Последний оплаченный день по зачислениям: `enrollmentId → periodEnd`. */
  async paidUntilOf(enrollmentIds: string[]): Promise<Map<string, Date>> {
    if (enrollmentIds.length === 0) return new Map();
    const rows = await this.prisma.paidPeriod.groupBy({
      by: ['enrollmentId'],
      where: { enrollmentId: { in: enrollmentIds } },
      _max: { periodEnd: true },
    });
    return new Map(
      rows.flatMap((row) => (row._max.periodEnd ? [[row.enrollmentId, row._max.periodEnd]] : [])),
    );
  }

  // ---------- кошелёк родителя ----------

  async walletBalance(parentId: string): Promise<number> {
    const row = await this.prisma.parentWallet.findUnique({ where: { parentId } });
    return row?.balanceKopecks ?? 0;
  }

  async topUpWallet(parentId: string, amountKopecks: number): Promise<number> {
    const row = await this.prisma.parentWallet.upsert({
      where: { parentId },
      create: { parentId, balanceKopecks: amountKopecks },
      update: { balanceKopecks: { increment: amountKopecks } },
    });
    return row.balanceKopecks;
  }

  // ---------- кошелёк преподавателя ----------

  listTeacherTransactions(
    teacherId: string,
    from?: Date,
  ): Promise<
    Array<{
      id: string;
      kind: 'INCOME' | 'WITHDRAWAL';
      amountKopecks: number;
      currency: string;
      groupId: string | null;
      studentId: string | null;
      at: Date;
    }>
  > {
    return this.prisma.teacherWalletTransaction.findMany({
      where: { teacherId, ...(from ? { at: { gte: from } } : {}) },
      orderBy: { at: 'desc' },
      select: {
        id: true,
        kind: true,
        amountKopecks: true,
        currency: true,
        groupId: true,
        studentId: true,
        at: true,
      },
    });
  }

  /** Баланс на момент `at` (по умолчанию — текущий): поступления минус выводы. */
  async teacherBalance(teacherId: string, at?: Date): Promise<number> {
    const rows = await this.prisma.teacherWalletTransaction.groupBy({
      by: ['kind'],
      where: { teacherId, ...(at ? { at: { lte: at } } : {}) },
      _sum: { amountKopecks: true },
    });
    return rows.reduce(
      (sum, row) => sum + (row.kind === 'INCOME' ? 1 : -1) * (row._sum.amountKopecks ?? 0),
      0,
    );
  }

  async createWithdrawal(
    teacherId: string,
    amountKopecks: number,
    currency: string,
    at: Date,
  ): Promise<{ id: string; at: Date }> {
    const row = await this.prisma.teacherWalletTransaction.create({
      data: { teacherId, kind: 'WITHDRAWAL', amountKopecks, currency, at },
      select: { id: true, at: true },
    });
    return row;
  }
}
