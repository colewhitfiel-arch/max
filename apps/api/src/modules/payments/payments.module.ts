import { Module } from '@nestjs/common';
import { AppLogger } from '../../common/logger/logger.service';
import { type Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { FakePaymentProvider } from './provider/fake-payment.provider';
import { PAYMENT_PROVIDER } from './provider/payment-provider';
import { YooKassaPaymentProvider } from './provider/yookassa-payment.provider';
import { TeacherWalletService } from './teacher-wallet.service';

/**
 * payments: оплата кружков родителем, кошельки родителя и преподавателя, вебхук провайдера.
 * Провайдер выбирается по `PAYMENT_PROVIDER`; наличие ключей проверяет config/env.
 */
@Module({
  imports: [GroupsModule, FamilyModule, IdentityModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsRepository,
    PaymentsService,
    TeacherWalletService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV, AppLogger],
      useFactory: (env: Env, logger: AppLogger) =>
        env.PAYMENT_PROVIDER === 'yookassa'
          ? new YooKassaPaymentProvider(
              env.YOOKASSA_SHOP_ID!,
              env.YOOKASSA_SECRET_KEY!,
              logger.child({ module: 'payments' }),
            )
          : new FakePaymentProvider(env.WEB_URL),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
