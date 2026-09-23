export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Статус платежа у провайдера, приведённый к нашему словарю (`PaymentStatus`). */
export type ProviderPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface CreatePaymentInput {
  /** Наш id платежа: он же ключ идемпотентности у провайдера. */
  paymentId: string;
  amountKopecks: number;
  currency: string;
  description: string;
  /** Куда вернуть пользователя после оплаты. */
  returnUrl: string;
}

export interface CreatedPayment {
  providerPaymentId: string;
  /** Страница оплаты; клиент открывает её через MaxBridge.openLink. */
  confirmationUrl: string;
  status: ProviderPaymentStatus;
}

/** Итог проверки платежа: и для вебхука, и для опроса статуса. */
export interface ProviderPaymentState {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  failReason?: string;
  raw?: unknown;
}

/**
 * Порт платёжного провайдера (docs/08 §8.2). Реализации: fake (dev) и YooKassa.
 * Модуль payments не знает ни про HTTP провайдера, ни про формат его вебхука.
 */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /**
   * Разбор вебхука провайдера. Возвращает null, если событие не про платёж или не наше.
   * Реализация обязана подтвердить подлинность (подпись или повторный запрос к провайдеру).
   */
  parseWebhook(headers: Record<string, string | undefined>, body: unknown): Promise<ProviderPaymentState | null>;
  /** Актуальный статус платежа — опрос, если вебхук не дошёл. */
  getState(providerPaymentId: string): Promise<ProviderPaymentState>;
}
