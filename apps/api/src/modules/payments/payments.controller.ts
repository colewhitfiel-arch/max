import { Controller, Headers } from '@nestjs/common';
import { paymentsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import { PaymentsService } from './payments.service';
import { TeacherWalletService } from './teacher-wallet.service';

/** Реализация contracts/routes/payments.ts. */
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly wallet: TeacherWalletService,
  ) {}

  // ---------- родитель ----------

  @TsRestHandler(paymentsContract.getChildPayments)
  @RequirePermission('parent:payments.view')
  childPayments(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.getChildPayments, async ({ params, query }) => ({
      status: 200,
      body: await this.payments.getChildPayments(user, params.studentId, query),
    }));
  }

  @TsRestHandler(paymentsContract.createPayment)
  @RequirePermission('parent:payments.pay')
  create(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.createPayment, async ({ params, body, headers }) => ({
      status: 200,
      body: await this.payments.createPayment(
        user,
        params.studentId,
        body,
        headers['idempotency-key'],
      ),
    }));
  }

  @TsRestHandler(paymentsContract.getPayment)
  @RequirePermission('parent:payments.view')
  get(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.getPayment, async ({ params }) => ({
      status: 200,
      body: await this.payments.getPayment(user, params.paymentId),
    }));
  }

  @TsRestHandler(paymentsContract.getWallet)
  @RequirePermission('parent:payments.view')
  parentWallet(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.getWallet, async () => ({
      status: 200,
      body: await this.payments.getWallet(user),
    }));
  }

  @TsRestHandler(paymentsContract.topUpWallet)
  @RequirePermission('parent:payments.pay')
  topUp(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.topUpWallet, async ({ body, headers }) => ({
      status: 200,
      body: await this.payments.topUpWallet(user, body, headers['idempotency-key']),
    }));
  }

  // ---------- преподаватель ----------

  @TsRestHandler(paymentsContract.getTeacherWallet)
  @RequirePermission('teacher:wallet.view')
  teacherWallet(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.getTeacherWallet, async ({ query }) => ({
      status: 200,
      body: await this.wallet.getWallet(user, query),
    }));
  }

  @TsRestHandler(paymentsContract.withdrawTeacherWallet)
  @RequirePermission('teacher:wallet.withdraw')
  withdraw(@CurrentUser() user: AuthUser) {
    return tsRestHandler(paymentsContract.withdrawTeacherWallet, async ({ body, headers }) => ({
      status: 200,
      body: await this.wallet.withdraw(user, body, headers['idempotency-key']),
    }));
  }

  // ---------- вебхук провайдера ----------

  /**
   * Провайдер вызывает ручку без нашего токена — подлинность проверяет адаптер
   * (подпись или повторный запрос платежа). Ответ всегда 200: иначе провайдер будет
   * повторять доставку бесконечно.
   */
  @TsRestHandler(paymentsContract.paymentWebhook)
  @Public()
  webhook(@Headers() headers: Record<string, string | undefined>) {
    return tsRestHandler(paymentsContract.paymentWebhook, async ({ params, body }) => {
      await this.payments.handleWebhook(params.provider, headers, body);
      return { status: 200, body: { ok: true as const } };
    });
  }
}
