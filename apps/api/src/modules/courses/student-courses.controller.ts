import { Controller } from '@nestjs/common';
import { coursesContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { StudentCoursesService } from './student-courses.service';

/** Экраны курса у ученика (contracts/routes/courses.ts, ученическая часть). */
@Controller()
export class StudentCoursesController {
  constructor(private readonly service: StudentCoursesService) {}

  @TsRestHandler(coursesContract.listStudentCourses)
  @RequirePermission('student:courses.view')
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.listStudentCourses, async () => ({
      status: 200,
      body: await this.service.listCourses(user),
    }));
  }

  @TsRestHandler(coursesContract.getStudentCourse)
  @RequirePermission('student:courses.view')
  get(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.getStudentCourse, async ({ params }) => ({
      status: 200,
      body: await this.service.getCourse(user, params.courseId),
    }));
  }

  @TsRestHandler(coursesContract.getStudentBlock)
  @RequirePermission('student:courses.view')
  getBlock(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.getStudentBlock, async ({ params }) => ({
      status: 200,
      body: await this.service.getBlock(user, params.blockId),
    }));
  }

  @TsRestHandler(coursesContract.openBlock)
  @RequirePermission('student:courses.view')
  open(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.openBlock, async ({ params }) => ({
      status: 200,
      body: await this.service.openBlock(user, params.blockId),
    }));
  }

  @TsRestHandler(coursesContract.completeBlock)
  @RequirePermission('student:blocks.complete')
  complete(@CurrentUser() user: AuthUser) {
    return tsRestHandler(coursesContract.completeBlock, async ({ params, body }) => ({
      status: 200,
      body: await this.service.completeBlock(user, params.blockId, body),
    }));
  }
}
