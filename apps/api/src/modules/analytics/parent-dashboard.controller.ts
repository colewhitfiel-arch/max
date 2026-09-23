import { Controller } from '@nestjs/common';
import { dashboardsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { ParentDashboardService } from './parent-dashboard.service';

/** Экраны родителя по ребёнку из contracts/routes/dashboards.ts. */
@Controller()
export class ParentDashboardController {
  constructor(private readonly service: ParentDashboardService) {}

  @TsRestHandler(dashboardsContract.getParentChildHome)
  @RequirePermission('parent:child.home.view')
  home(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getParentChildHome, async ({ params }) => ({
      status: 200,
      body: await this.service.getHome(user, params.studentId),
    }));
  }

  @TsRestHandler(dashboardsContract.getParentChildAnalytics)
  @RequirePermission('parent:child.analytics.view')
  analytics(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getParentChildAnalytics, async ({ params }) => ({
      status: 200,
      body: await this.service.getAnalytics(user, params.studentId),
    }));
  }

  @TsRestHandler(dashboardsContract.getParentChildHomeworkProgress)
  @RequirePermission('parent:child.analytics.view')
  progress(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      dashboardsContract.getParentChildHomeworkProgress,
      async ({ params, query }) => ({
        status: 200,
        body: await this.service.getHomeworkProgress(user, params.studentId, query),
      }),
    );
  }

  @TsRestHandler(dashboardsContract.getParentChildGroupTasks)
  @RequirePermission('parent:child.analytics.view')
  groupTasks(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getParentChildGroupTasks, async ({ params }) => ({
      status: 200,
      body: await this.service.getGroupTasks(user, params.studentId, params.groupId),
    }));
  }
}
