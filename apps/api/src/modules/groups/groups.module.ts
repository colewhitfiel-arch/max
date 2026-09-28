import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { GroupManagementService } from './group-management.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/**
 * groups: публичный сервис с policies, занятия преподавателя и управление его группами
 * (создание, название, состав). Кружки — из catalog, ученики школы — из identity (docs/08).
 */
@Module({
  imports: [IdentityModule, CatalogModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupManagementService],
  exports: [GroupsService],
})
export class GroupsModule {}
