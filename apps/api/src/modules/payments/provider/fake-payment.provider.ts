import type {
  CreatePaymentInput,
  CreatedPayment,
  PaymentProvider,
  ProviderPaymentState,
} from './payment-provider';

/**
 * Провайдер для разработки (`PAYMENT_PROVIDER=fake`): платёж считается оплаченным сразу,
 * страница оплаты — экран платежа в приложении. Боевой путь (`PENDING` → вебхук → `SUCCEEDED`)
 * от этого не пропадает: он реализован в сервисе и используется настоящим провайдером.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';

  constructor(private readonly webUrl: string) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    return {
      providerPaymentId: `fake-${input.paymentId}`,
      confirmationUrl: input.returnUrl || `${this.webUrl}/parent/payments/${input.paymentId}`,
      status: 'SUCCEEDED',
    };
  }

  /** Вебхука у fake-провайдера нет: платёж закрывается при создании. */
  async parseWebhook(): Promise<ProviderPaymentState | null> {
    return null;
  }

  async getState(providerPaymentId: string): Promise<ProviderPaymentState> {
    return { providerPaymentId, status: 'SUCCEEDED' };
  }
}
