/** Задания и сдачи: ученик (список/деталь/сдача), преподаватель (список/создание/проверка). */
import {
  type Assignment,
  AssignmentBriefSchema,
  AssignmentSubmissionsSchema,
  CreateAssignmentBodySchema,
  GradeSubmissionBodySchema,
  StudentAssignmentDetailSchema,
  StudentHomeworkDtoSchema,
  type Submission,
  SubmissionDtoSchema,
  SubmitAssignmentBodySchema,
  TeacherAssignmentCardSchema,
  TeacherSubmissionDetailSchema,
  UpdateAssignmentBodySchema,
  paginated,
} from '@edu/contracts';
import { http } from 'msw';
import {
  assignmentBrief,
  assignmentsOfStudent,
  dueAtOf,
  gamification,
  groupBrief,
  groupIdsOfStudent,
  groupsOfTeacher,
  isDone,
  studentBrief,
  studentIdsOfGroup,
} from '../demo';
import { apiError, apiUrl, authed, json, noContent, query, readBody } from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';
import { fileDto } from './files';

const submissionDto = ({ answers: _answers, ...s }: Submission) => s;

/** Сдача по заданию этого преподавателя (иначе 404/403, как `listSubmissions`). */
function ownSubmission(userId: string, submissionId: string): Submission | Response {
  const submission = db.submissions.find((s) => s.id === submissionId);
  if (!submission) return apiError('NOT_FOUND', 'Сдача не найдена');
  const teacher = teacherOfUser(userId);
  const assignment = db.assignments.find((a) => a.id === submission.assignmentId);
  if (!teacher || !assignment || assignment.teacherId !== teacher.id)
    return apiError('FORBIDDEN', 'Чужое задание');
  return submission;
}

function teacherCard(assignment: Assignment) {
  const studentIds = studentIdsOfGroup(assignment.groupId);
  const submissions = db.submissions.filter((s) => s.assignmentId === assignment.id);
  const { submission: _s, ...brief } = assignmentBrief(assignment.id);
  return {
    ...brief,
    description: assignment.description,
    allowedAttempts: assignment.allowedAttempts,
    publishedAt: assignment.publishedAt,
    studentsCount: studentIds.length,
    submittedCount: submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED')
      .length,
    gradedCount: submissions.filter((s) => s.status === 'GRADED').length,
  };
}

export const assignmentsHandlers = [
  http.get(
    apiUrl('/student/assignments'),
    authed(
      ({ auth, request }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const status = query(request).get('status') ?? 'all';
        const items = assignmentsOfStudent(student.id)
          .filter((a) => {
            const done = isDone(a.id, student.id);
            return status === 'all' || (status === 'open' ? !done : done);
          })
          .map((a) => assignmentBrief(a.id, student.id));
        return json(paginated(AssignmentBriefSchema), { items });
      },
      ['STUDENT'],
    ),
  ),

  http.get(
    apiUrl('/student/homework'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const dueTime = (a: Assignment) => {
          const due = dueAtOf(a);
          return due ? new Date(due).getTime() : Number.POSITIVE_INFINITY;
        };
        const clubs = groupIdsOfStudent(student.id).map((groupId) => {
          const group = groupBrief(groupId);
          const open = assignmentsOfStudent(student.id)
            .filter((a) => a.groupId === groupId && !isDone(a.id, student.id))
            .sort((a, b) => dueTime(a) - dueTime(b));
          // Баллы по кружку — сумма оценок за проверенные сдачи (заглушка формулы analytics).
          const points = db.submissions
            .filter(
              (s) =>
                s.studentId === student.id &&
                s.status === 'GRADED' &&
                db.assignments.some((a) => a.id === s.assignmentId && a.groupId === groupId),
            )
            .reduce((sum, s) => sum + (s.score ?? 0), 0);
          const next = open[0];
          return {
            club: group.club,
            group,
            openCount: open.length,
            points,
            nextAssignment: next ? assignmentBrief(next.id, student.id) : null,
            nextDue: next ? dueTime(next) : Number.POSITIVE_INFINITY,
          };
        });
        return json(StudentHomeworkDtoSchema, {
          clubs: clubs
            .sort((a, b) => a.nextDue - b.nextDue)
            .map(({ nextDue: _due, ...club }) => club),
          // Серия и кристаллы — как на главной (`/student/home`), docs/04 §4.6.
          ...gamification(student.id),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ assignmentId: string }>(
    apiUrl('/student/assignments/:assignmentId'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        const assignment = db.assignments.find((a) => a.id === params.assignmentId);
        if (!assignment) return apiError('NOT_FOUND', 'Задание не найдено');
        if (!student || !assignmentsOfStudent(student.id).some((a) => a.id === assignment.id)) {
          return apiError('FORBIDDEN', 'Задание не твоей группы');
        }
        const submission = db.submissions.find(
          (s) => s.assignmentId === assignment.id && s.studentId === student.id,
        );
        return json(StudentAssignmentDetailSchema, {
          ...assignmentBrief(assignment.id, student.id),
          description: assignment.description,
          block:
            assignment.blockId && assignment.courseId
              ? { id: assignment.blockId, courseId: assignment.courseId }
              : null,
          submission: submission ? submissionDto(submission) : null,
          attemptsLeft:
            assignment.allowedAttempts === null
              ? null
              : Math.max(0, assignment.allowedAttempts - (submission?.attemptsCount ?? 0)),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ assignmentId: string }>(
    apiUrl('/student/assignments/:assignmentId/submit'),
    authed(
      async ({ auth, params, request }) => {
        const student = studentOfUser(auth.user.id);
        const assignment = db.assignments.find((a) => a.id === params.assignmentId);
        if (!assignment) return apiError('NOT_FOUND', 'Задание не найдено');
        // Как в GET детали: только опубликованные задания групп ученика.
        if (!student || !assignmentsOfStudent(student.id).some((a) => a.id === assignment.id)) {
          return apiError('FORBIDDEN', 'Задание не твоей группы');
        }
        const body = await readBody(request, SubmitAssignmentBodySchema);
        if (!body.ok) return body.response;
        const key = request.headers.get('idempotency-key');
        // Контракт требует Idempotency-Key: без него — 400, как у ts-rest на сервере.
        if (!key) return apiError('VALIDATION', 'Нужен заголовок Idempotency-Key');
        const replayKey = `${student.id}:${key}`;
        const previous = db.submissionReplays.get(replayKey);
        if (previous) {
          if (previous.assignmentId !== assignment.id) {
            return apiError('CONFLICT', 'Ключ идемпотентности уже использован для другого задания');
          }
          return json(SubmissionDtoSchema, previous.result);
        }
        const dueAt = dueAtOf(assignment);
        let submission = db.submissions.find(
          (s) => s.assignmentId === assignment.id && s.studentId === student.id,
        );
        if (
          assignment.allowedAttempts !== null &&
          (submission?.attemptsCount ?? 0) >= assignment.allowedAttempts
        ) {
          return apiError('BUSINESS_RULE', 'Попытки закончились');
        }
        if (!submission) {
          submission = {
            id: crypto.randomUUID(),
            assignmentId: assignment.id,
            studentId: student.id,
            status: 'SUBMITTED',
            attemptsCount: 0,
            score: null,
            answers: null,
            fileIds: [],
            text: null,
            submittedAt: null,
            gradedAt: null,
            gradedById: null,
            feedback: null,
            isLate: false,
          };
          db.submissions.push(submission);
        }
        // Новая попытка: оценка прошлой проверки к ней не относится.
        submission.status = 'SUBMITTED';
        submission.score = null;
        submission.gradedAt = null;
        submission.gradedById = null;
        submission.feedback = null;
        submission.attemptsCount += 1;
        submission.text = body.data.text ?? null;
        submission.fileIds = body.data.fileIds ?? [];
        submission.answers =
          body.data.answers ?? (body.data.text ? { text: body.data.text } : null);
        submission.submittedAt = new Date().toISOString();
        submission.isLate = !!dueAt && new Date(dueAt).getTime() < Date.now();
        const result = submissionDto(submission);
        db.submissionReplays.set(replayKey, {
          assignmentId: assignment.id,
          result: { ...result },
        });
        return json(SubmissionDtoSchema, result);
      },
      ['STUDENT'],
    ),
  ),

  http.get(
    apiUrl('/teacher/assignments'),
    authed(
      ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const q = query(request);
        const groupId = q.get('groupId');
        const status = q.get('status');
        const groupIds = groupsOfTeacher(teacher.id).map((g) => g.id);
        const now = Date.now();
        const items = db.assignments
          .filter((a) => groupIds.includes(a.groupId) && (!groupId || a.groupId === groupId))
          .filter((a) => {
            if (!status) return true;
            const due = dueAtOf(a);
            const closed = !!due && new Date(due).getTime() < now;
            return status === 'closed' ? closed : !closed;
          })
          .map(teacherCard);
        return json(paginated(TeacherAssignmentCardSchema), { items });
      },
      ['TEACHER'],
    ),
  ),

  http.post(
    apiUrl('/teacher/assignments'),
    authed(
      async ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const body = await readBody(request, CreateAssignmentBodySchema);
        if (!body.ok) return body.response;
        if (!groupsOfTeacher(teacher.id).some((g) => g.id === body.data.groupId)) {
          return apiError('FORBIDDEN', 'Чужая группа');
        }
        const assignment: Assignment = {
          id: crypto.randomUUID(),
          groupId: body.data.groupId,
          teacherId: teacher.id,
          courseId: null,
          blockId: null,
          title: body.data.title,
          description: body.data.description ?? null,
          type: body.data.type,
          dueAt: body.data.dueAt ?? null,
          maxScore: body.data.maxScore ?? 100,
          allowedAttempts: body.data.allowedAttempts ?? null,
          publishedAt: body.data.publish ? new Date().toISOString() : null,
        };
        db.assignments.push(assignment);
        return json(TeacherAssignmentCardSchema, teacherCard(assignment));
      },
      ['TEACHER'],
    ),
  ),

  http.patch<{ assignmentId: string }>(
    apiUrl('/teacher/assignments/:assignmentId'),
    authed(
      async ({ auth, params, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        const assignment = db.assignments.find((a) => a.id === params.assignmentId);
        if (!assignment) return apiError('NOT_FOUND', 'Задание не найдено');
        if (!teacher || assignment.teacherId !== teacher.id)
          return apiError('FORBIDDEN', 'Чужое задание');
        const body = await readBody(request, UpdateAssignmentBodySchema);
        if (!body.ok) return body.response;
        if (body.data.title) assignment.title = body.data.title;
        if (body.data.description !== undefined) assignment.description = body.data.description;
        if (body.data.dueAt !== undefined) assignment.dueAt = body.data.dueAt;
        if (body.data.publish && !assignment.publishedAt)
          assignment.publishedAt = new Date().toISOString();
        return json(TeacherAssignmentCardSchema, teacherCard(assignment));
      },
      ['TEACHER'],
    ),
  ),

  http.delete<{ assignmentId: string }>(
    apiUrl('/teacher/assignments/:assignmentId'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const index = db.assignments.findIndex((a) => a.id === params.assignmentId);
        if (index < 0) return apiError('NOT_FOUND', 'Задание не найдено');
        if (!teacher || db.assignments[index]!.teacherId !== teacher.id)
          return apiError('FORBIDDEN', 'Чужое задание');
        db.assignments.splice(index, 1);
        // Вместе с заданием уходят и его сдачи: иначе карточка ученика и аналитика родителя
        // споткнутся о сдачу без задания.
        db.submissions = db.submissions.filter((s) => s.assignmentId !== params.assignmentId);
        return noContent();
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ assignmentId: string }>(
    apiUrl('/teacher/assignments/:assignmentId/submissions'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const assignment = db.assignments.find((a) => a.id === params.assignmentId);
        if (!assignment) return apiError('NOT_FOUND', 'Задание не найдено');
        if (!teacher || assignment.teacherId !== teacher.id)
          return apiError('FORBIDDEN', 'Чужое задание');
        return json(AssignmentSubmissionsSchema, {
          assignment: teacherCard(assignment),
          rows: studentIdsOfGroup(assignment.groupId).map((studentId) => {
            const submission = db.submissions.find(
              (s) => s.assignmentId === assignment.id && s.studentId === studentId,
            );
            return {
              student: studentBrief(studentId),
              submission: submission ? submissionDto(submission) : null,
            };
          }),
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ submissionId: string }>(
    apiUrl('/teacher/submissions/:submissionId'),
    authed(
      ({ auth, params }) => {
        const submission = ownSubmission(auth.user.id, params.submissionId);
        if (submission instanceof Response) return submission;
        return json(TeacherSubmissionDetailSchema, {
          ...submission,
          files: submission.fileIds.flatMap((id) => {
            const file = db.files.find((f) => f.id === id);
            return file ? [fileDto(file)] : [];
          }),
          attempts: submission.submittedAt
            ? [
                {
                  n: submission.attemptsCount,
                  score: submission.score,
                  submittedAt: submission.submittedAt,
                },
              ]
            : [],
        });
      },
      ['TEACHER'],
    ),
  ),

  http.post<{ submissionId: string }>(
    apiUrl('/teacher/submissions/:submissionId/grade'),
    authed(
      async ({ auth, params, request }) => {
        const submission = ownSubmission(auth.user.id, params.submissionId);
        if (submission instanceof Response) return submission;
        const body = await readBody(request, GradeSubmissionBodySchema);
        if (!body.ok) return body.response;
        submission.status = body.data.status;
        submission.score = body.data.score;
        submission.feedback = body.data.feedback ?? null;
        submission.gradedAt = new Date().toISOString();
        submission.gradedById = teacherOfUser(auth.user.id)!.id;
        return json(SubmissionDtoSchema, submissionDto(submission));
      },
      ['TEACHER'],
    ),
  ),
];
