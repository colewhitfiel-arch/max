import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { GroupsModule } from '../groups/groups.module';
import { TeacherGroupsController } from './teacher-groups.controller';
import { TeacherGroupsService } from './teacher-groups.service';

/**
 * analytics: показатели успеваемости. Пока — группы преподавателя (`GET /teacher/groups*`);
 * остальные дашборды — workstream A. Формулы живут в `metrics.ts`/`gamification.ts`.
 */
@Module({
  imports: [GroupsModule, AttendanceModule, AssignmentsModule],
  controllers: [TeacherGroupsController],
  providers: [TeacherGroupsService],
  exports: [TeacherGroupsService],
})
export class AnalyticsModule {}
