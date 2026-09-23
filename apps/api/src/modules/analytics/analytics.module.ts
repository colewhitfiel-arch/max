import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { CoursesModule } from '../courses/courses.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { SchoolModule } from '../school/school.module';
import { StudentDashboardController } from './student-dashboard.controller';
import { StudentDashboardService } from './student-dashboard.service';
import { TeacherGroupsController } from './teacher-groups.controller';
import { TeacherGroupsService } from './teacher-groups.service';

/**
 * analytics: показатели успеваемости — главная и профиль ученика, группы преподавателя.
 * Формулы живут только здесь (`metrics.ts`, `gamification.ts`, `homework.ts`), данные приносят
 * публичные сервисы своих модулей.
 */
@Module({
  imports: [
    GroupsModule,
    AttendanceModule,
    AssignmentsModule,
    CoursesModule,
    IdentityModule,
    SchoolModule,
  ],
  controllers: [TeacherGroupsController, StudentDashboardController],
  providers: [TeacherGroupsService, StudentDashboardService],
  exports: [TeacherGroupsService, StudentDashboardService],
})
export class AnalyticsModule {}
