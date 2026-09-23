import { Controller } from '@nestjs/common';
import { coursesContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { CoursesService } from './courses.service';

/**
 * Курсы преподавателя (часть contracts/routes/courses.ts). Экраны ученика
 * (`/student/courses`, блоки) — за workstream B, здесь не реализованы и отвечают 501.
 */
@Controller()
@RequirePermission('teacher:courses.manage')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @TsRestHandler(coursesContract.listTeacherCourses)
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.listTeacherCourses, async ({ query }) => ({
      status: 200,
      body: await this.courses.listTeacherCourses(requireTeacher(user), query.groupId),
    }));
  }

  @TsRestHandler(coursesContract.createCourse)
  create(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.createCourse, async ({ body }) => ({
      status: 200,
      body: await this.courses.createCourse(requireTeacher(user), body),
    }));
  }

  @TsRestHandler(coursesContract.getTeacherCourse)
  get(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.getTeacherCourse, async ({ params }) => ({
      status: 200,
      body: await this.courses.getTeacherCourse(requireTeacher(user), params.courseId),
    }));
  }

  @TsRestHandler(coursesContract.replaceCourseStructure)
  replaceStructure(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.replaceCourseStructure, async ({ params, body }) => ({
      status: 200,
      body: await this.courses.replaceStructure(requireTeacher(user), params.courseId, body),
    }));
  }

  @TsRestHandler(coursesContract.publishCourse)
  publish(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.publishCourse, async ({ params, body }) => {
      const { detail } = await this.courses.publishCourse(
        requireTeacher(user),
        params.courseId,
        body,
      );
      return { status: 200, body: detail };
    });
  }

  @TsRestHandler(coursesContract.updateBlock)
  updateBlock(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.updateBlock, async ({ params, body }) => ({
      status: 200,
      body: await this.courses.updateBlock(requireTeacher(user), params.blockId, body),
    }));
  }

  @TsRestHandler(coursesContract.getCourseProgress)
  progress(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.getCourseProgress, async ({ params }) => ({
      status: 200,
      body: await this.courses.getCourseProgress(requireTeacher(user), params.courseId),
    }));
  }

  @TsRestHandler(coursesContract.archiveCourse)
  archive(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.archiveCourse, async ({ params }) => ({
      status: 200,
      body: await this.courses.archiveCourse(requireTeacher(user), params.courseId),
    }));
  }
}

function requireTeacher(user: AuthUser): string {
  if (user.activeRole !== 'TEACHER' || !user.profileId)
    throw Errors.forbidden('Только для преподавателя');
  return user.profileId;
}
