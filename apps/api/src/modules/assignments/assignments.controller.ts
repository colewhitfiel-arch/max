import { Controller } from '@nestjs/common';
import { assignmentsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AssignmentsService } from './assignments.service';

/** Реализация contracts/routes/assignments.ts. */
@Controller()
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  // ---------- ученик ----------

  @TsRestHandler(assignmentsContract.listStudentAssignments)
  @RequirePermission('student:assignments.view')
  listStudent(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.listStudentAssignments, async ({ query }) => ({
      status: 200,
      body: await this.service.listStudent(user, query),
    }));
  }

  @TsRestHandler(assignmentsContract.getStudentHomework)
  @RequirePermission('student:assignments.view')
  homework(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.getStudentHomework, async () => ({
      status: 200,
      body: await this.service.getHomework(user),
    }));
  }

  @TsRestHandler(assignmentsContract.getStudentAssignment)
  @RequirePermission('student:assignments.view')
  getStudent(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.getStudentAssignment, async ({ params }) => ({
      status: 200,
      body: await this.service.getStudent(user, params.assignmentId),
    }));
  }

  @TsRestHandler(assignmentsContract.submitAssignment)
  @RequirePermission('student:assignments.submit')
  submit(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      assignmentsContract.submitAssignment,
      async ({ params, body, headers }) => ({
        status: 200,
        body: await this.service.submit(
          user,
          params.assignmentId,
          body,
          headers['idempotency-key'],
        ),
      }),
    );
  }

  // ---------- преподаватель ----------

  @TsRestHandler(assignmentsContract.listTeacherAssignments)
  @RequirePermission('teacher:assignments.manage')
  listTeacher(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.listTeacherAssignments, async ({ query }) => ({
      status: 200,
      body: await this.service.listTeacher(user, query),
    }));
  }

  @TsRestHandler(assignmentsContract.createAssignment)
  @RequirePermission('teacher:assignments.manage')
  create(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.createAssignment, async ({ body }) => ({
      status: 200,
      body: await this.service.create(user, body),
    }));
  }

  @TsRestHandler(assignmentsContract.updateAssignment)
  @RequirePermission('teacher:assignments.manage')
  update(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.updateAssignment, async ({ params, body }) => ({
      status: 200,
      body: await this.service.update(user, params.assignmentId, body),
    }));
  }

  @TsRestHandler(assignmentsContract.deleteAssignment)
  @RequirePermission('teacher:assignments.manage')
  remove(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.deleteAssignment, async ({ params }) => {
      await this.service.remove(user, params.assignmentId);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(assignmentsContract.listSubmissions)
  @RequirePermission('teacher:submissions.grade')
  listSubmissions(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.listSubmissions, async ({ params }) => ({
      status: 200,
      body: await this.service.listSubmissions(user, params.assignmentId),
    }));
  }

  @TsRestHandler(assignmentsContract.getSubmission)
  @RequirePermission('teacher:submissions.grade')
  getSubmission(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.getSubmission, async ({ params }) => ({
      status: 200,
      body: await this.service.getSubmission(user, params.submissionId),
    }));
  }

  @TsRestHandler(assignmentsContract.gradeSubmission)
  @RequirePermission('teacher:submissions.grade')
  grade(@CurrentUser() user: AuthUser) {
    return tsRestHandler(assignmentsContract.gradeSubmission, async ({ params, body }) => ({
      status: 200,
      body: await this.service.grade(user, params.submissionId, body),
    }));
  }
}
