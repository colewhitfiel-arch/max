import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { SchoolModule } from '../school/school.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { TeacherGroupsService } from './teacher-groups.service';

/**
 * groups: публичный сервис с policies, занятия преподавателя, его новые группы и вступление по
 * ссылке. Кружок новой группы создаёт catalog (docs/08: groups → catalog, identity, school).
 */
@Module({
  imports: [CatalogModule, IdentityModule, SchoolModule],
  controllers: [GroupsController],
  providers: [GroupsService, TeacherGroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
