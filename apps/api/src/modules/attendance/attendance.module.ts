import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';

/** attendance: лист посещаемости занятия и отметка (workstream H, docs/07 F6). */
@Module({
  imports: [GroupsModule],
  controllers: [AttendanceController],
  providers: [AttendanceRepository, AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
