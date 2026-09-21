import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';

/** groups: публичный сервис с policies. Контроллеры — workstream E. */
@Module({
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
