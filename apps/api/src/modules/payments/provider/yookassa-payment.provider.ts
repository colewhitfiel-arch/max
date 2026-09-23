import { Errors } from '../../../common/errors/app-error';
import type {
  CreatePaymentInput,
  CreatedPayment,
  PaymentProvider,
  ProviderPaymentState,
  ProviderPaymentStatus,
} from './payment-provider';

/** Минимум логгера, который нужен адаптеру (подходит и pino-child, и AppLogger). */
interface ProviderLogger {
  error(obj: object, msg: string): void;
}

const API_URL = 'https://api.yookassa.ru/v3';
const TIMEOUT_MS = 15_000;

interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  confirmation?: { confirmation_url?: string };
  cancellation_details?: { reason?: string };
}

const STATUS: Record<YooKassaPayment['status'], ProviderPaymentStatus> = {
  pending: 'PENDING',
  waiting_for_capture: 'PENDING',
  succeeded: 'SUCCEEDED',
  canceled: 'FAILED',
};

/** Сумма в копейках → «1234.56», как требует API ЮKassa. */
const toAmount = (kopecks: number) => (kopecks / 100).toFixed(2);

/**
 * ЮKassa (`PAYMENT_PROVIDER=yookassa`). Подписи у вебхука нет — подлинность подтверждается
 * повторным запросом платежа по его id: из тела берётся только идентификатор, статус —
 * всегда из ответа API.
 */
export class YooKassaPaymentProvider implements PaymentProvider {
  readonly name = 'yookassa';
  private readonly auth: string;

  constructor(
    shopId: string,
    secretKey: string,
    private readonly log: ProviderLogger,
  ) {
    this.auth = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const payment = await this.request<YooKassaPayment>('POST', '/payments', {
      // Наш id платежа — ключ идемпотентности: повтор запроса не создаст второй платёж.
      idempotenceKey: input.paymentId,
      body: {
        amount: { value: toAmount(input.amountKopecks), currency: input.currency },
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: input.description,
        metadata: { paymentId: input.paymentId },
      },
    });
    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) throw Errors.external('yookassa: платёж без ссылки на оплату');
    return {
      providerPaymentId: payment.id,
      confirmationUrl,
      status: STATUS[payment.status],
    };
  }

  async parseWebhook(
    _headers: Record<string, string | undefined>,
    body: unknown,
  ): Promise<ProviderPaymentState | null> {
    const event = body as { event?: string; object?: { id?: string } } | null;
    const id = event?.object?.id;
    if (!id || !event?.event?.startsWith('payment.')) return null;
    return this.getState(id);
  }

  async getState(providerPaymentId: string): Promise<ProviderPaymentState> {
    const payment = await this.request<YooKassaPayment>(
      'GET',
      `/payments/${encodeURIComponent(providerPaymentId)}`,
    );
    return {
      providerPaymentId: payment.id,
      status: STATUS[payment.status],
      ...(payment.cancellation_details?.reason
        ? { failReason: payment.cancellation_details.reason }
        : {}),
      raw: payment,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { idempotenceKey?: string; body?: unknown } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: this.auth,
          'Content-Type': 'application/json',
          ...(options.idempotenceKey ? { 'Idempotence-Key': options.idempotenceKey } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        // Тело ответа провайдера в лог не пишем целиком: в нём бывают данные плательщика.
        this.log.error({ status: response.status, path }, 'yookassa: ошибка запроса');
        throw Errors.external(`yookassa (${response.status})`);
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw Errors.external('yookassa: таймаут');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
