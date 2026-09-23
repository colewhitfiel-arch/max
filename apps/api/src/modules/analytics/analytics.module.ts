import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { CoursesModule } from '../courses/courses.module';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchoolModule } from '../school/school.module';
import { ParentDashboardController } from './parent-dashboard.controller';
import { ParentDashboardService } from './parent-dashboard.service';
import { StudentDashboardController } from './student-dashboard.controller';
import { StudentDashboardService } from './student-dashboard.service';
import { StudentFactsService } from './student-facts.service';
import { TeacherDashboardController } from './teacher-dashboard.controller';
import { TeacherDashboardService } from './teacher-dashboard.service';
import { TeacherGroupsController } from './teacher-groups.controller';
import { TeacherGroupsService } from './teacher-groups.service';

/**
 * analytics: все показатели успеваемости — экраны ученика, родителя и преподавателя.
 * Формулы живут только здесь (`metrics.ts`, `gamification.ts`, `homework.ts`,
 * `homework-details.ts`), данные приносят публичные сервисы своих модулей.
 */
@Module({
  imports: [
    GroupsModule,
    AttendanceModule,
    AssignmentsModule,
    CoursesModule,
    IdentityModule,
    SchoolModule,
    FamilyModule,
    NotificationsModule,
  ],
  controllers: [
    TeacherGroupsController,
    StudentDashboardController,
    ParentDashboardController,
    TeacherDashboardController,
  ],
  providers: [
    StudentFactsService,
    TeacherGroupsService,
    StudentDashboardService,
    ParentDashboardService,
    TeacherDashboardService,
  ],
  exports: [TeacherGroupsService, StudentDashboardService],
})
export class AnalyticsModule {}
