import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { SchoolModule } from '../school/school.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';

/**
 * attendance: лист посещаемости занятия и отметка (docs/07 F6), самоотметка ученика по QR-коду
 * занятия (F6a), а также календари ученика и родителя — занятия за период вместе с отметками.
 */
@Module({
  imports: [GroupsModule, FamilyModule, SchoolModule],
  controllers: [AttendanceController, CheckInController, CalendarController],
  providers: [AttendanceRepository, AttendanceService, CheckInService, CalendarService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
