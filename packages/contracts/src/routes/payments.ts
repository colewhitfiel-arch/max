/**
 * Платежи родителя за кружки, кошелёк (заглушка) и вебхук провайдера. Владелец — B8.
 * docs/05-api-contracts.md §5.3 `payments.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateOnlySchema, IdSchema, MoneySchema, PaginationQuerySchema, paginated } from '../common';
import { ClubBriefSchema, PaymentDtoSchema } from '../entities';
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
