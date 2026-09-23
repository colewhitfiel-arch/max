import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentsModule } from '../payments/payments.module';
import { SchoolModule } from '../school/school.module';
import { ChildrenController } from './children.controller';
import { ChildrenService } from './children.service';

/**
 * parent: экраны родителя, собранные из публичных сервисов (дети, приглашения, кружки
 * ребёнка). Своих таблиц у модуля нет — связи живут в family, профили в identity,
 * оплаты в payments, показатели в analytics.
 */
@Module({
  imports: [
    FamilyModule,
    IdentityModule,
    SchoolModule,
    GroupsModule,
    CatalogModule,
    PaymentsModule,
    AnalyticsModule,
  ],
  controllers: [ChildrenController],
  providers: [ChildrenService],
})
export class ParentModule {}
