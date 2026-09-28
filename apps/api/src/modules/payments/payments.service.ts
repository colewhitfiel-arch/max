import { Inject, Injectable } from '@nestjs/common';
import {
  type ChildPayments,
  type CreatePaymentBody,
  type CreatePaymentResult,
  type PaginationQuery,
  type PaymentDto,
  type PaymentPeriod,
  type TopUpWalletBody,
  type Wallet,
  IdSchema,
} from '@edu/contracts';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { runIdempotent } from '../../common/kv/idempotency';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { AppLogger } from '../../common/logger/logger.service';
import { decodeCursor, normalizeLimit, toPage } from '../../common/pagination/cursor';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { FamilyService } from '../family/family.service';
import { type EnrollmentForBilling, GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { type PaymentRow, PaymentsRepository } from './payments.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider';

const PaymentCursorSchema = z.object({ createdAt: z.string().datetime(), id: IdSchema });

/** Сколько помнить результат пополнения по `Idempotency-Key`. */
const TOPUP_REPLAY_TTL_SEC = 24 * 60 * 60;
const DAY_MS = 86_400_000;

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Конец периода длиной `months` месяцев от `start` включительно (последний оплаченный день). */
function addMonths(start: Date, months: number): Date {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return new Date(end.getTime() - DAY_MS);
}

/**
 * Оплата кружков родителем (docs/07 F10) и кошелёк родителя (F13). Провайдер — за портом
 * `PaymentProvider`: модуль не знает ни про HTTP, ни про формат вебхука. Платёж закрывается
 * ровно один раз — и по вебхуку, и по опросу статуса (`settle` идемпотентен в БД).
 */
@Injectable()
export class PaymentsService {
  private readonly log;

  constructor(
    private readonly repo: PaymentsRepository,
    private readonly groups: GroupsService,
    private readonly family: FamilyService,
    private readonly identity: IdentityService,
    private readonly events: DomainEventBus,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    @InjectEnv() private readonly env: Env,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'payments' });
  }

  // ---------- платежи родителя ----------

  async getChildPayments(
    user: AuthUser,
    studentId: string,
    query: PaginationQuery,
  ): Promise<ChildPayments> {
    const parentId = await this.requireParentOf(user, studentId);
    const enrollments = await this.groups.listEnrollmentsForBilling(studentId);
    const periods = await this.periodsOf(enrollments);
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor, PaymentCursorSchema);
    const rows = await this.repo.listByParent(
      parentId,
      {
        studentId,
        ...(cursor ? { before: { createdAt: new Date(cursor.createdAt), id: cursor.id } } : {}),
      },
      limit,
    );
    const page = toPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    const history = await this.toDtos(page.items);
    return {
      periods,
      history: { items: history, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) },
    };
  }

  async createPayment(
    user: AuthUser,
    studentId: string,
    body: CreatePaymentBody,
    idempotencyKey: string,
  ): Promise<CreatePaymentResult> {
    const parentId = await this.requireParentOf(user, studentId);
    const key = `${parentId}:${idempotencyKey}`;
    const existing = await this.repo.findByIdempotencyKey(key);
    if (existing) {
      if (existing.studentId !== studentId)
        throw Errors.conflict('Ключ идемпотентности уже использован для другого ребёнка');
      return this.toCreateResult(existing);
    }

    const enrollment = await this.groups.getEnrollmentForBilling(body.enrollmentId);
    // Ушедший из группы (LEFT) не платит за неё: экран оплат мог устареть, пока его убирали.
    if (!enrollment || enrollment.studentId !== studentId || enrollment.status === 'LEFT')
      throw Errors.notFound('Зачисление');
    const amountKopecks = enrollment.priceKopecks * body.periodsCount;

    const payment = await this.repo.create({
      parentId,
      studentId,
      enrollmentId: enrollment.id,
      amountKopecks,
      currency: 'RUB',
      provider: this.provider.name,
      periodsCount: body.periodsCount,
      idempotencyKey: key,
    });

    const created = await this.provider.createPayment({
      paymentId: payment.id,
      amountKopecks,
      currency: 'RUB',
      description: `${enrollment.group.club.title}: ${body.periodsCount} мес.`,
      returnUrl: `${this.env.WEB_URL}/parent/payments/${payment.id}`,
    });
    const withProvider = await this.repo.updateProviderData(payment.id, {
      providerPaymentId: created.providerPaymentId,
      confirmationUrl: created.confirmationUrl,
    });
    this.log.info(
      { paymentId: payment.id, provider: this.provider.name, status: created.status },
      'платёж создан',
    );
    if (created.status === 'SUCCEEDED') await this.settle(withProvider, null);
    if (created.status === 'FAILED') await this.repo.markFailed(payment.id, null, null);
    return this.toCreateResult(withProvider);
  }

  async getPayment(user: AuthUser, paymentId: string): Promise<PaymentDto> {
    const parentId = requireParent(user);
    const row = await this.repo.findById(paymentId);
    if (!row || row.parentId !== parentId) throw Errors.notFound('Платёж');
    // Вебхук мог не дойти — спрашиваем провайдера, пока платёж висит в PENDING.
    if (row.status === 'PENDING' && row.providerPaymentId) {
      const state = await this.provider.getState(row.providerPaymentId);
      if (state.status === 'SUCCEEDED') await this.settle(row, state.raw ?? null);
      if (state.status === 'FAILED')
        await this.repo.markFailed(row.id, state.failReason ?? null, state.raw ?? null);
    }
    const fresh = (await this.repo.findById(paymentId)) ?? row;
    const [dto] = await this.toDtos([fresh]);
    if (!dto) throw Errors.notFound('Платёж');
    return dto;
  }

  /** Вебхук провайдера: тело разбирает адаптер, он же подтверждает подлинность. */
  async handleWebhook(
    providerName: string,
    headers: Record<string, string | undefined>,
    body: unknown,
  ): Promise<void> {
    if (providerName !== this.provider.name) {
      this.log.warn({ provider: providerName }, 'вебхук неизвестного провайдера');
      return;
    }
    const state = await this.provider.parseWebhook(headers, body);
    if (!state) return;
    const payment = await this.repo.findByProviderId(state.providerPaymentId);
    if (!payment) {
      this.log.warn({ providerPaymentId: state.providerPaymentId }, 'вебхук по чужому платежу');
      return;
    }
    if (state.status === 'SUCCEEDED') await this.settle(payment, state.raw ?? null);
    if (state.status === 'FAILED')
      await this.repo.markFailed(payment.id, state.failReason ?? null, state.raw ?? null);
  }

  // ---------- кошелёк родителя ----------

  async getWallet(user: AuthUser): Promise<Wallet> {
    const parentId = requireParent(user);
    return { balance: { amountKopecks: await this.repo.walletBalance(parentId), currency: 'RUB' } };
  }

  /**
   * Пополнение кошелька — заглушка до провайдера (docs/07 F13): сумма зачисляется сразу,
   * без оплаты. Поэтому с настоящим провайдером ручка выключена: иначе она печатала бы деньги.
   * `Idempotency-Key` защищает от повтора: тот же ключ отдаёт прежний баланс, не зачисляя дважды
   * (ключ занимается атомарно до зачисления — и для параллельных запросов).
   */
  async topUpWallet(
    user: AuthUser,
    body: TopUpWalletBody,
    idempotencyKey: string,
  ): Promise<Wallet> {
    const parentId = requireParent(user);
    if (this.provider.name !== 'fake')
      throw Errors.notImplemented('Пополнение кошелька через провайдера');
    const key = `wallet:topup:${parentId}:${idempotencyKey}`;
    const { value: wallet, replayed } = await runIdempotent(
      this.kv,
      key,
      TOPUP_REPLAY_TTL_SEC,
      async (): Promise<Wallet> => {
        const balance = await this.repo.topUpWallet(parentId, body.amountKopecks);
        return { balance: { amountKopecks: balance, currency: 'RUB' } };
      },
    );
    if (!replayed)
      this.log.info({ parentId, amountKopecks: body.amountKopecks }, 'кошелёк пополнен');
    return wallet;
  }

  // ---------- публичный сервис ----------

  /** Оплачиваемые периоды по зачислениям (кружки ребёнка и экран оплат). */
  async periodsOf(enrollments: EnrollmentForBilling[]): Promise<PaymentPeriod[]> {
    const paidUntil = await this.repo.paidUntilOf(enrollments.map((item) => item.id));
    return enrollments.map((enrollment) => {
      const paid = paidUntil.get(enrollment.id) ?? null;
      const afterPaid = paid ? paid.getTime() + DAY_MS : 0;
      return {
        enrollmentId: enrollment.id,
        club: enrollment.group.club,
        paidUntil: paid ? toDateOnly(paid) : null,
        // Следующий платёж — день после оплаченного периода, но не раньше зачисления: у вернувшегося
        // в группу старые периоды остаются, а платить за время, когда его не было, он не должен.
        nextPaymentAt: toDateOnly(new Date(Math.max(afterPaid, enrollment.enrolledAt.getTime()))),
        price: { amountKopecks: enrollment.priceKopecks, currency: 'RUB' as const },
      };
    });
  }

  // ---------- внутреннее ----------

  /**
   * Закрыть платёж: оплаченные периоды продолжают уже оплаченные, поступление уходит
   * преподавателю группы. Повторный вызов ничего не меняет (проверка статуса в транзакции).
   */
  private async settle(payment: PaymentRow, raw: unknown): Promise<void> {
    const enrollment = await this.groups.getEnrollmentForBilling(payment.enrollmentId);
    const paidUntil = (await this.repo.paidUntilOf([payment.enrollmentId])).get(
      payment.enrollmentId,
    );
    const paidAt = new Date();
    const today = startOfUtcDay(paidAt);
    // Новый период начинается после уже оплаченного, а если тот истёк — с сегодняшнего дня.
    let cursor =
      paidUntil && paidUntil.getTime() >= today.getTime()
        ? new Date(paidUntil.getTime() + DAY_MS)
        : today;
    const periods = Array.from({ length: payment.periodsCount }, () => {
      const periodStart = cursor;
      const periodEnd = addMonths(periodStart, 1);
      cursor = new Date(periodEnd.getTime() + DAY_MS);
      return { periodStart, periodEnd };
    });

    const settled = await this.repo.settle({
      paymentId: payment.id,
      enrollmentId: payment.enrollmentId,
      periods,
      paidAt,
      raw,
      // Доля школы в модели данных пока не заведена (docs/04 payments) — преподавателю уходит
      // вся сумма оплаты; появится доля — меняется только это место.
      teacherIncome: enrollment
        ? {
            teacherId: enrollment.teacherId,
            groupId: enrollment.groupId,
            studentId: payment.studentId,
            amountKopecks: payment.amountKopecks,
            currency: payment.currency,
          }
        : null,
    });
    if (!settled) return;
    this.log.info({ paymentId: payment.id, periods: periods.length }, 'платёж оплачен');
    await this.events.emit('payment.succeeded', {
      paymentId: payment.id,
      enrollmentId: payment.enrollmentId,
      studentId: payment.studentId,
      parentId: payment.parentId,
      periodsCount: payment.periodsCount,
      at: paidAt.toISOString(),
    });
  }

  private toCreateResult(payment: PaymentRow): CreatePaymentResult {
    if (!payment.confirmationUrl) throw Errors.external('Платёжный провайдер: нет ссылки оплаты');
    return {
      paymentId: payment.id,
      confirmationUrl: payment.confirmationUrl,
      amount: { amountKopecks: payment.amountKopecks, currency: 'RUB' },
    };
  }

  private async toDtos(rows: PaymentRow[]): Promise<PaymentDto[]> {
    if (rows.length === 0) return [];
    const enrollments = await Promise.all(
      [...new Set(rows.map((row) => row.enrollmentId))].map((id) =>
        this.groups.getEnrollmentForBilling(id),
      ),
    );
    const byEnrollment = new Map(
      enrollments.flatMap((item) => (item ? [[item.id, item] as const] : [])),
    );
    const students = await this.identity.studentBriefsByIds([
      ...new Set(rows.map((row) => row.studentId)),
    ]);
    return rows.flatMap((row) => {
      const enrollment = byEnrollment.get(row.enrollmentId);
      const student = students.get(row.studentId);
      if (!enrollment || !student) return [];
      return [
        {
          id: row.id,
          parentId: row.parentId,
          studentId: row.studentId,
          enrollmentId: row.enrollmentId,
          amount: { amountKopecks: row.amountKopecks, currency: 'RUB' as const },
          status: row.status,
          provider: row.provider,
          periodsCount: row.periodsCount,
          confirmationUrl: row.confirmationUrl,
          createdAt: row.createdAt.toISOString(),
          paidAt: row.paidAt?.toISOString() ?? null,
          failReason: row.failReason,
          club: enrollment.group.club,
          student,
        },
      ];
    });
  }

  private async requireParentOf(user: AuthUser, studentId: string): Promise<string> {
    const parentId = requireParent(user);
    await this.family.assertParentLinked(parentId, studentId);
    return parentId;
  }
}

function requireParent(user: AuthUser): string {
  if (user.activeRole !== 'PARENT' || !user.profileId)
    throw Errors.forbidden('Только для родителя');
  return user.profileId;
}
