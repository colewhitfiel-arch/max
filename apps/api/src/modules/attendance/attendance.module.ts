import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * attendance: лист посещаемости занятия и отметка (docs/07 F6), а также календари ученика
 * и родителя — занятия за период вместе с отметками.
 */
@Module({
  imports: [GroupsModule, FamilyModule],
  controllers: [AttendanceController, CalendarController],
  providers: [AttendanceRepository, AttendanceService, CalendarService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
