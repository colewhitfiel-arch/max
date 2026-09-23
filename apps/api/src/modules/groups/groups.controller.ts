import { Controller } from '@nestjs/common';
import { groupsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { periodBounds } from '../../common/time/period';
import { GroupsService } from './groups.service';

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
