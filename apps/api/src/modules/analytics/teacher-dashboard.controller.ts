import { Controller } from '@nestjs/common';
import { dashboardsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { TeacherDashboardService } from './teacher-dashboard.service';

/** Главная, карточка ученика и «Общая успеваемость» преподавателя. */
@Controller()
export class TeacherDashboardController {
  constructor(private readonly service: TeacherDashboardService) {}

  @TsRestHandler(dashboardsContract.getTeacherHome)
  @RequirePermission('teacher:home.view')
  home(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getTeacherHome, async () => ({
      status: 200,
      body: await this.service.getHome(user),
    }));
  }

  @TsRestHandler(dashboardsContract.getTeacherStudent)
  @RequirePermission('teacher:students.view')
  student(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getTeacherStudent, async ({ params }) => ({
      status: 200,
      body: await this.service.getStudent(user, params.studentId),
    }));
  }

  @TsRestHandler(dashboardsContract.getTeacherStudentGroupTasks)
  @RequirePermission('teacher:students.view')
  studentGroupTasks(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getTeacherStudentGroupTasks, async ({ params }) => ({
      status: 200,
      body: await this.service.getStudentGroupTasks(user, params.studentId, params.groupId),
    }));
  }

  @TsRestHandler(dashboardsContract.getTeacherPerformance)
  @RequirePermission('teacher:groups.view')
  performance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getTeacherPerformance, async ({ query }) => ({
      status: 200,
      body: await this.service.getPerformance(user, query),
    }));
  }
}
