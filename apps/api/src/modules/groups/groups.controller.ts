import { Controller } from '@nestjs/common';
import { groupsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { periodBounds } from '../../common/time/period';
import { GroupManagementService } from './group-management.service';
import { GroupsService } from './groups.service';

/**
 * Занятия и группы преподавателя (часть contracts/routes/groups.ts): календарь, занятия,
 * создание группы, название и состав. Календари ученика и родителя — за workstream E/H,
 * здесь не реализованы и отвечают 501.
 */
@Controller()
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly management: GroupManagementService,
  ) {}

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

  @TsRestHandler(groupsContract.createGroup)
  @RequirePermission('teacher:groups.manage')
  createGroup(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.createGroup, async ({ body }) => ({
      status: 200,
      body: await this.management.createGroup(requireTeacher(user), body),
    }));
  }

  @TsRestHandler(groupsContract.updateGroup)
  @RequirePermission('teacher:groups.manage')
  updateGroup(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.updateGroup, async ({ params, body }) => ({
      status: 200,
      body: await this.management.updateGroup(requireTeacher(user), params.groupId, body),
    }));
  }

  @TsRestHandler(groupsContract.listGroupCandidates)
  @RequirePermission('teacher:groups.manage')
  groupCandidates(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.listGroupCandidates, async ({ params, query }) => ({
      status: 200,
      body: {
        items: await this.management.listCandidates(requireTeacher(user), params.groupId, query.q),
      },
    }));
  }

  @TsRestHandler(groupsContract.addGroupStudent)
  @RequirePermission('teacher:groups.manage')
  addGroupStudent(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.addGroupStudent, async ({ params, body }) => ({
      status: 200,
      body: await this.management.addStudent(requireTeacher(user), params.groupId, body.studentId),
    }));
  }

  @TsRestHandler(groupsContract.removeGroupStudent)
  @RequirePermission('teacher:groups.manage')
  removeGroupStudent(@CurrentUser() user: AuthUser) {
    return tsRestHandler(groupsContract.removeGroupStudent, async ({ params }) => ({
      status: 200,
      body: await this.management.removeStudent(
        requireTeacher(user),
        params.groupId,
        params.studentId,
      ),
    }));
  }
}

function requireTeacher(user: AuthUser): string {
  if (user.activeRole !== 'TEACHER' || !user.profileId)
    throw Errors.forbidden('Только для преподавателя');
  return user.profileId;
}
