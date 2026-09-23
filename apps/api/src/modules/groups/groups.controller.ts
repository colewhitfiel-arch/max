import { Controller } from '@nestjs/common';
import { groupsContract, type PeriodQuery } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { GroupsService } from './groups.service';

/** Сколько дней показывать, если период в запросе не задан. */
const DEFAULT_DAYS_BACK = 30;
const DEFAULT_DAYS_FORWARD = 30;

const startOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * Период запроса в границы дат. `from`/`to` — `YYYY-MM-DD`, обе включительно:
 * `to` растягивается до конца своего дня, иначе занятия этого дня выпали бы из выборки.
 */
function periodBounds(query: PeriodQuery): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : addDays(today, -DEFAULT_DAYS_BACK);
  const to = query.to
    ? new Date(`${query.to}T23:59:59.999Z`)
    : addDays(today, DEFAULT_DAYS_FORWARD + 1);
  if (to.getTime() < from.getTime()) throw Errors.validation('Конец периода раньше начала');
  return { from, to };
}

/**
 * Занятия преподавателя (часть contracts/routes/groups.ts). Календари ученика и родителя —
 * за workstream E/H, здесь не реализованы и отвечают 501.
 */
@Controller()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @TsRestHandler(groupsContract.getTeacherCalendar)
  @RequirePermission('teacher:groups.view')
  teacherCalendar(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.getTeacherCalendar, async ({ query }) => {
      const teacherId = requireTeacher(user);
      const { from, to } = periodBounds(query);
      const groups = await this.groups.listGroupsByTeacher(teacherId);
      const lessons = await this.groups.listLessons(
        groups.map((group) => group.id),
        from,
        to,
      );
      return { status: 200, body: { lessons } };
    });
  }

  @TsRestHandler(groupsContract.listGroupLessons)
  @RequirePermission('teacher:groups.view')
  groupLessons(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.listGroupLessons, async ({ params, query }) => {
      const teacherId = requireTeacher(user);
      await this.groups.assertTeacherOwnsGroup(teacherId, params.groupId);
      const { from, to } = periodBounds(query);
      const lessons = await this.groups.listLessons([params.groupId], from, to);
      return { status: 200, body: { lessons } };
    });
  }

  @TsRestHandler(groupsContract.createLesson)
  @RequirePermission('teacher:lessons.manage')
  createLesson(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.createLesson, async ({ params, body }) => ({
      status: 200,
      body: await this.groups.createLesson(requireTeacher(user), params.groupId, body),
    }));
  }

  @TsRestHandler(groupsContract.updateLesson)
  @RequirePermission('teacher:lessons.manage')
  updateLesson(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.updateLesson, async ({ params, body }) => ({
      status: 200,
      body: await this.groups.updateLesson(requireTeacher(user), params.lessonId, body),
    }));
  }
}

function requireTeacher(user: AuthUser): string {
  if (user.activeRole !== 'TEACHER' || !user.profileId)
    throw Errors.forbidden('Только для преподавателя');
  return user.profileId;
}
