import { Controller } from '@nestjs/common';
import { dashboardsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { TeacherGroupsService } from './teacher-groups.service';

/**
 * Группы преподавателя из contracts/routes/dashboards.ts. Остальные дашборды
 * (главные, успеваемость, карточка ученика) — workstream A, отвечают 501.
 */
@Controller()
@RequirePermission('teacher:groups.view')
export class TeacherGroupsController {
  constructor(private readonly service: TeacherGroupsService) {}

  @TsRestHandler(dashboardsContract.listTeacherGroups)
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.listTeacherGroups, async () => ({
      status: 200,
      body: await this.service.listGroups(requireTeacher(user)),
    }));
  }

  @TsRestHandler(dashboardsContract.getTeacherGroup)
  get(@CurrentUser() user: AuthUser) {
    return tsRestHandler(dashboardsContract.getTeacherGroup, async ({ params }) => ({
      status: 200,
      body: await this.service.getGroup(requireTeacher(user), params.groupId),
    }));
  }
}

function requireTeacher(user: AuthUser): string {
  if (user.activeRole !== 'TEACHER' || !user.profileId)
    throw Errors.forbidden('Только для преподавателя');
  return user.profileId;
}
