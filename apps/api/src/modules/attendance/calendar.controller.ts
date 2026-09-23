import { Controller } from '@nestjs/common';
import { groupsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { CalendarService } from './calendar.service';

/**
 * Календари ученика и родителя (contracts/routes/groups.ts): занятия за период вместе с
 * отметками посещаемости. Живут в модуле attendance — только он читает свои отметки,
 * а занятия приносит публичный `GroupsService`.
 */
@Controller()
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @TsRestHandler(groupsContract.getStudentCalendar)
  @RequirePermission('student:calendar.view')
  student(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.getStudentCalendar, async ({ query }) => ({
      status: 200,
      body: await this.calendar.forStudent(user, query),
    }));
  }

  @TsRestHandler(groupsContract.getParentChildCalendar)
  @RequirePermission('parent:child.calendar.view')
  parent(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.getParentChildCalendar, async ({ params, query }) => ({
      status: 200,
      body: await this.calendar.forChild(user, params.studentId, query),
    }));
  }
}
