import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { SchoolModule } from '../school/school.module';
import { GroupManagementService } from './group-management.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { ScheduleMaterializerService } from './schedule-materializer.service';
import { ScheduleJobs } from './schedule.jobs';

/**
 * groups: публичный сервис с policies, занятия преподавателя и управление его группами
 * (создание, название, состав), материализация расписания (job `schedule.materialize`).
 * Кружки — из catalog, ученики школы — из identity, пояс школы — из school (docs/08).
 */
@Module({
  imports: [IdentityModule, CatalogModule, SchoolModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupManagementService, ScheduleMaterializerService, ScheduleJobs],
  exports: [GroupsService],
})
export class GroupsModule {}
