import { Controller } from '@nestjs/common';
import { dashboardsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { StudentDashboardService } from './student-dashboard.service';

/** Главная и профиль ученика из contracts/routes/dashboards.ts. */
@Controller()
export class StudentDashboardController {
  constructor(private readonly service: StudentDashboardService) {}

  @TsRestHandler(dashboardsContract.getStudentHome)
  @RequirePermission('student:home.view')
  home(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getStudentHome, async () => ({
      status: 200,
      body: await this.service.getHome(user),
    }));
  }

  @TsRestHandler(dashboardsContract.getStudentProfile)
  @RequirePermission('student:home.view')
  profile(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getStudentProfile, async () => ({
      status: 200,
      body: await this.service.getProfile(user),
    }));
  }
}
