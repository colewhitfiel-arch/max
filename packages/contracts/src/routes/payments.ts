/**
 * Платежи родителя за кружки, кошельки родителя и преподавателя (заглушки) и вебхук провайдера.
 * Владелец — B8. docs/05-api-contracts.md §5.3 `payments.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  DateOnlySchema,
  DateTimeSchema,
  IdSchema,
  MoneySchema,
  PaginationQuerySchema,
  paginated,
} from '../common';
import {
  ClubBriefSchema,
  GroupBriefSchema,
  PaymentDtoSchema,
  StudentBriefSchema,
} from '../entities';
import { contractRouterOptions, IdempotencyKeyHeadersSchema, publicRoute, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

/** Оплачиваемый период по зачислению. */
export const PaymentPeriodSchema = z.object({
  enrollmentId: IdSchema,
  club: ClubBriefSchema,
  paidUntil: DateOnlySchema.nullable(),
  nextPaymentAt: DateOnlySchema,
  price: MoneySchema,
});
export type PaymentPeriod = z.infer<typeof PaymentPeriodSchema>;

export const ChildPaymentsSchema = z.object({
  periods: z.array(PaymentPeriodSchema),
  history: paginated(PaymentDtoSchema),
});
export type ChildPayments = z.infer<typeof ChildPaymentsSchema>;

export const CreatePaymentResultSchema = z.object({
  paymentId: IdSchema,
  /** Ссылка на страницу оплаты провайдера. */
  confirmationUrl: z.string().url(),
  amount: MoneySchema,
});
export type CreatePaymentResult = z.infer<typeof CreatePaymentResultSchema>;

export const WebhookAckSchema = z.object({ ok: z.literal(true) });
export type WebhookAck = z.infer<typeof WebhookAckSchema>;

/** Кошелёк родителя. Заглушка: реального провайдера пока нет (docs/07 F13). */
export const WalletSchema = z.object({ balance: MoneySchema });
export type Wallet = z.infer<typeof WalletSchema>;

// ---------- Кошелёк преподавателя (заглушка до PaymentProvider, docs/04 payments) ----------

/** Периоды графика и списка транзакций: 1 день, 7 дней, 30 дней. */
export const TEACHER_WALLET_PERIODS = ['day', 'week', 'month'] as const;
export const TeacherWalletPeriodSchema = z.enum(TEACHER_WALLET_PERIODS);
export type TeacherWalletPeriod = z.infer<typeof TeacherWalletPeriodSchema>;
export const TEACHER_WALLET_DEFAULT_PERIOD: TeacherWalletPeriod = 'day';

/**
 * Query кошелька: `?period=day|week|month`, по умолчанию `day`. Окна скользящие до «сейчас»:
 * последние 24 часа / 7 × 24 / 30 × 24 часа (docs/04 payments).
 */
export const TeacherWalletQuerySchema = z.object({
  period: TeacherWalletPeriodSchema.default(TEACHER_WALLET_DEFAULT_PERIOD),
});
export type TeacherWalletQuery = z.infer<typeof TeacherWalletQuerySchema>;

/** INCOME — поступление за занятия ученика, WITHDRAWAL — вывод средств преподавателем. */
export const TEACHER_WALLET_TRANSACTION_KINDS = ['INCOME', 'WITHDRAWAL'] as const;
export const TeacherWalletTransactionKindSchema = z.enum(TEACHER_WALLET_TRANSACTION_KINDS);
export type TeacherWalletTransactionKind = z.infer<typeof TeacherWalletTransactionKindSchema>;

/** Операция по кошельку преподавателя. */
export const TeacherWalletTransactionSchema = z.object({
  id: IdSchema,
  kind: TeacherWalletTransactionKindSchema,
  /** Всегда больше нуля; направление задаёт `kind`. */
  amount: MoneySchema.extend({ amountKopecks: z.number().int().positive() }),
  at: DateTimeSchema,
  /** Группа, за которую поступили деньги; у вывода — null. */
  group: GroupBriefSchema.nullable(),
  /** Ученик, за которого поступили деньги; у вывода — null. */
  student: StudentBriefSchema.nullable(),
});
export type TeacherWalletTransaction = z.infer<typeof TeacherWalletTransactionSchema>;

/** «Вам должны»: зачисление в группу преподавателя с неоплаченным следующим периодом. */
export const TeacherDebtSchema = z.object({
  /** Enrollment.id. */
  id: IdSchema,
  group: GroupBriefSchema,
  student: StudentBriefSchema,
  /** Цена периода кружка. */
  amount: MoneySchema,
  /** Дата следующего платежа; раньше сегодняшней — просрочено. */
  dueAt: DateOnlySchema,
});
export type TeacherDebt = z.infer<typeof TeacherDebtSchema>;

/** Точка графика «Изменение баланса». */
export const BalancePointSchema = z.object({
  at: DateTimeSchema,
  balance: MoneySchema,
});
export type BalancePoint = z.infer<typeof BalancePointSchema>;

export const TeacherWalletSchema = z.object({
  balance: MoneySchema,
  period: TeacherWalletPeriodSchema,
  /** Границы окна периода: from — начало, to — момент расчёта. */
  from: DateTimeSchema,
  to: DateTimeSchema,
  /**
   * По возрастанию `at`, с равным шагом (day — 7 точек через 4 часа, week — 8, month — 31 через
   * сутки): первая точка — баланс на `from`, последняя — текущий баланс.
   */
  history: z.array(BalancePointSchema),
  /** Операции за период, по убыванию `at`. */
  transactions: z.array(TeacherWalletTransactionSchema),
  /** «Вам должны»: просроченные и ближайшие платежи, по возрастанию `dueAt`. */
  debts: z.array(TeacherDebtSchema),
});
export type TeacherWallet = z.infer<typeof TeacherWalletSchema>;

export const TeacherWithdrawalSchema = z.object({
  /** Баланс после вывода. */
  balance: MoneySchema,
  /** Созданная операция `WITHDRAWAL`. */
  transaction: TeacherWalletTransactionSchema,
});
export type TeacherWithdrawal = z.infer<typeof TeacherWithdrawalSchema>;

// ---------- Тела запросов ----------

export const PAYMENT_MAX_PERIODS = 12;

export const CreatePaymentBodySchema = z.object({
  enrollmentId: IdSchema,
  periodsCount: z.number().int().min(1).max(PAYMENT_MAX_PERIODS),
});
export type CreatePaymentBody = z.infer<typeof CreatePaymentBodySchema>;

/** Пределы одного пополнения кошелька: 100 ₽ … 100 000 ₽. */
export const WALLET_TOPUP_MIN_KOPECKS = 100_00;
export const WALLET_TOPUP_MAX_KOPECKS = 100_000_00;

export const TopUpWalletBodySchema = z.object({
  amountKopecks: z.number().int().min(WALLET_TOPUP_MIN_KOPECKS).max(WALLET_TOPUP_MAX_KOPECKS),
});
export type TopUpWalletBody = z.infer<typeof TopUpWalletBodySchema>;

/** Минимальная сумма вывода — 100 ₽; максимум — текущий баланс (иначе BUSINESS_RULE). */
export const TEACHER_WITHDRAW_MIN_KOPECKS = 100_00;

export const WithdrawTeacherWalletBodySchema = z.object({
  amountKopecks: z.number().int().min(TEACHER_WITHDRAW_MIN_KOPECKS),
});
export type WithdrawTeacherWalletBody = z.infer<typeof WithdrawTeacherWalletBodySchema>;

// ---------- Роуты ----------

export const paymentsContract = c.router(
  {
    getChildPayments: {
      method: 'GET',
      path: '/parent/children/:studentId/payments',
      pathParams: z.object({ studentId: IdSchema }),
      query: PaginationQuerySchema,
      responses: { 200: ChildPaymentsSchema },
      summary: 'Оплачиваемые периоды и история платежей по ребёнку',
      metadata: userRoute('parent:payments.view'),
    },
    createPayment: {
      method: 'POST',
      path: '/parent/children/:studentId/payments',
      pathParams: z.object({ studentId: IdSchema }),
      headers: IdempotencyKeyHeadersSchema,
      body: CreatePaymentBodySchema,
      responses: { 200: CreatePaymentResultSchema },
      summary: 'Создать платёж и получить ссылку на оплату (Idempotency-Key)',
      metadata: userRoute('parent:payments.pay'),
    },
    getPayment: {
      method: 'GET',
      path: '/parent/payments/:paymentId',
      pathParams: z.object({ paymentId: IdSchema }),
      responses: { 200: PaymentDtoSchema },
      summary: 'Статус платежа',
      metadata: userRoute('parent:payments.view'),
    },
    getWallet: {
      method: 'GET',
      path: '/parent/wallet',
      responses: { 200: WalletSchema },
      summary: 'Баланс кошелька родителя',
      metadata: userRoute('parent:payments.view'),
    },
    topUpWallet: {
      method: 'POST',
      path: '/parent/wallet/top-up',
      headers: IdempotencyKeyHeadersSchema,
      body: TopUpWalletBodySchema,
      responses: { 200: WalletSchema },
      summary: 'Пополнить кошелёк (заглушка: зачисляется сразу, без провайдера; Idempotency-Key)',
      metadata: userRoute('parent:payments.pay'),
    },
    getTeacherWallet: {
      method: 'GET',
      path: '/teacher/wallet',
      query: TeacherWalletQuerySchema,
      responses: { 200: TeacherWalletSchema },
      summary:
        'Кошелёк преподавателя за период: баланс, график, транзакции и «Вам должны» (заглушка)',
      metadata: userRoute('teacher:wallet.view'),
    },
    withdrawTeacherWallet: {
      method: 'POST',
      path: '/teacher/wallet/withdraw',
      headers: IdempotencyKeyHeadersSchema,
      body: WithdrawTeacherWalletBodySchema,
      responses: { 200: TeacherWithdrawalSchema },
      summary:
        'Вывести средства с кошелька преподавателя (заглушка: списывается сразу; больше баланса — BUSINESS_RULE; Idempotency-Key)',
      metadata: userRoute('teacher:wallet.withdraw'),
    },
    paymentWebhook: {
      method: 'POST',
      path: '/webhooks/payments/:provider',
      pathParams: z.object({ provider: z.string().min(1) }),
      /** Формат зависит от провайдера; подпись проверяет адаптер PaymentProvider. */
      body: z.unknown(),
      responses: { 200: WebhookAckSchema },
      summary: 'Вебхук платёжного провайдера (проверка подписи, идемпотентность)',
      metadata: publicRoute(),
    },
  },
  contractRouterOptions,
);
