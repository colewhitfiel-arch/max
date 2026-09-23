import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsEvents } from './notifications.events';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * notifications: центр уведомлений и настройки, плюс обработчики доменных событий,
 * которые эти уведомления создают.
 */
@Module({
  imports: [IdentityModule, FamilyModule, GroupsModule, AssignmentsModule],
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService, NotificationsEvents],
  exports: [NotificationsService],
})
export class NotificationsModule {}
