/**
 * Задания и сдачи. Владелец — B5.
 * docs/05-api-contracts.md §5.3 `assignments.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { BlockAnswersSchema } from '../blocks';
import { DateTimeSchema, IdSchema, PaginationQuerySchema, paginated } from '../common';
import { AssignmentTypeSchema } from '../enums';
import {
  AssignmentBriefSchema,
  ClubBriefSchema,
  FileSchema,
  GroupBriefSchema,
  StudentBriefSchema,
  SubmissionSchema,
} from '../entities';
import { contractRouterOptions, IdempotencyKeyHeadersSchema, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

/** Сдача без ответов (answers отдаются только в `GET /teacher/submissions/:id`). */
export const SubmissionDtoSchema = SubmissionSchema.omit({ answers: true });
export type SubmissionDto = z.infer<typeof SubmissionDtoSchema>;

export const AssignmentBlockRefSchema = z.object({
  id: IdSchema,
  courseId: IdSchema,
});
export type AssignmentBlockRef = z.infer<typeof AssignmentBlockRefSchema>;

export const StudentAssignmentDetailSchema = AssignmentBriefSchema.extend({
  description: z.string().nullable(),
  /** Блок курса, из которого создано задание; null для «простых» заданий. */
  block: AssignmentBlockRefSchema.nullable(),
  submission: SubmissionDtoSchema.nullable(),
  /** null — попытки не ограничены. */
  attemptsLeft: z.number().int().nonnegative().nullable(),
});
export type StudentAssignmentDetail = z.infer<typeof StudentAssignmentDetailSchema>;

export const TeacherAssignmentCardSchema = AssignmentBriefSchema.omit({ submission: true }).extend({
  description: z.string().nullable(),
  allowedAttempts: z.number().int().positive().nullable(),
  publishedAt: DateTimeSchema.nullable(),
  studentsCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  gradedCount: z.number().int().nonnegative(),
});
export type TeacherAssignmentCard = z.infer<typeof TeacherAssignmentCardSchema>;

export const SubmissionRowSchema = z.object({
  student: StudentBriefSchema,
  submission: SubmissionDtoSchema.nullable(),
});
export type SubmissionRow = z.infer<typeof SubmissionRowSchema>;

export const AssignmentSubmissionsSchema = z.object({
  assignment: TeacherAssignmentCardSchema,
  rows: z.array(SubmissionRowSchema),
});
export type AssignmentSubmissions = z.infer<typeof AssignmentSubmissionsSchema>;

export const SubmissionAttemptBriefSchema = z.object({
  n: z.number().int().positive(),
  score: z.number().int().nullable(),
  submittedAt: DateTimeSchema,
});
export type SubmissionAttemptBrief = z.infer<typeof SubmissionAttemptBriefSchema>;

export const TeacherSubmissionDetailSchema = SubmissionDtoSchema.extend({
  answers: BlockAnswersSchema.nullable(),
  files: z.array(FileSchema),
  attempts: z.array(SubmissionAttemptBriefSchema),
});
export type TeacherSubmissionDetail = z.infer<typeof TeacherSubmissionDetailSchema>;

// ---------- Домашние задания ученика (экран «Задания») ----------

/** Кружок на карте заданий: сколько открыто, набранные баллы, ближайшее задание. */
export const HomeworkClubSchema = z.object({
  club: ClubBriefSchema,
  group: GroupBriefSchema,
  /** Открытые (не сданные) задания. */
  openCount: z.number().int().nonnegative(),
  /** Баллы по кружку (сумма оценок за проверенные сдачи; формула — analytics). */
  points: z.number().int().nonnegative(),
  /** Ближайшее по дедлайну открытое задание; null — открытых нет. */
  nextAssignment: AssignmentBriefSchema.nullable(),
});
export type HomeworkClub = z.infer<typeof HomeworkClubSchema>;

export const StudentHomeworkDtoSchema = z.object({
  /** Кружки ученика: сначала с ближайшим дедлайном, без дедлайна — в конце. */
  clubs: z.array(HomeworkClubSchema),
  /** Серия — как на главной (docs/04 §4.6); нет — пока не посчитано. */
  streakDays: z.number().int().nonnegative().optional(),
  /** Кристаллы — как на главной (docs/04 §4.6). */
  points: z.number().int().nonnegative().optional(),
});
export type StudentHomeworkDto = z.infer<typeof StudentHomeworkDtoSchema>;

// ---------- Query ----------

export const StudentAssignmentsFilterSchema = z.enum(['open', 'done', 'all']);
export type StudentAssignmentsFilter = z.infer<typeof StudentAssignmentsFilterSchema>;

export const ListStudentAssignmentsQuerySchema = PaginationQuerySchema.extend({
  /** По умолчанию — all. */
  status: StudentAssignmentsFilterSchema.optional(),
});
export type ListStudentAssignmentsQuery = z.infer<typeof ListStudentAssignmentsQuerySchema>;

export const TeacherAssignmentsFilterSchema = z.enum(['open', 'closed']);
export type TeacherAssignmentsFilter = z.infer<typeof TeacherAssignmentsFilterSchema>;

export const ListTeacherAssignmentsQuerySchema = PaginationQuerySchema.extend({
  groupId: IdSchema.optional(),
  status: TeacherAssignmentsFilterSchema.optional(),
});
export type ListTeacherAssignmentsQuery = z.infer<typeof ListTeacherAssignmentsQuerySchema>;

// ---------- Тела запросов ----------

/** Есть ли в ответе на блок хоть что-то: выбранный вариант QUIZ, текст или файл. */
function hasBlockAnswers(answers: z.infer<typeof BlockAnswersSchema> | undefined): boolean {
  if (!answers) return false;
  return Object.values(answers).some((value) =>
    Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '',
  );
}

/** Сдача задания: пустую (без ответов, текста и файлов) принять нельзя. */
export const SubmitAssignmentBodySchema = z
  .object({
    answers: BlockAnswersSchema.optional(),
    text: z.string().optional(),
    fileIds: z.array(IdSchema).optional(),
  })
  .refine(
    (body) =>
      (body.text?.trim() ?? '') !== '' ||
      (body.fileIds?.length ?? 0) > 0 ||
      hasBlockAnswers(body.answers),
    { message: 'Пустую работу сдать нельзя: добавь ответ, текст или файл' },
  );
export type SubmitAssignmentBody = z.infer<typeof SubmitAssignmentBodySchema>;

export const CreateAssignmentBodySchema = z.object({
  groupId: IdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  type: AssignmentTypeSchema.default('HOMEWORK'),
  dueAt: DateTimeSchema.optional(),
  maxScore: z.number().int().positive().optional(),
  allowedAttempts: z.number().int().positive().optional(),
  /** true — опубликовать сразу, иначе черновик (publishedAt = null). */
  publish: z.boolean(),
});
export type CreateAssignmentBody = z.infer<typeof CreateAssignmentBodySchema>;

/** null в description/dueAt — очистить поле. */
export const UpdateAssignmentBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dueAt: DateTimeSchema.nullable().optional(),
  publish: z.boolean().optional(),
});
export type UpdateAssignmentBody = z.infer<typeof UpdateAssignmentBodySchema>;

export const GradeSubmissionBodySchema = z.object({
  score: z.number().int().nonnegative(),
  feedback: z.string().optional(),
  /** RETURNED — вернуть на доработку (новая попытка). */
  status: z.enum(['GRADED', 'RETURNED']),
});
export type GradeSubmissionBody = z.infer<typeof GradeSubmissionBodySchema>;

// ---------- Роуты ----------

export const assignmentsContract = c.router(
  {
    listStudentAssignments: {
      method: 'GET',
      path: '/student/assignments',
      query: ListStudentAssignmentsQuerySchema,
      responses: { 200: paginated(AssignmentBriefSchema) },
      summary: 'Задания ученика с фильтром по статусу',
      metadata: userRoute('student:assignments.view'),
    },
    getStudentAssignment: {
      method: 'GET',
      path: '/student/assignments/:assignmentId',
      pathParams: z.object({ assignmentId: IdSchema }),
      responses: { 200: StudentAssignmentDetailSchema },
      summary: 'Задание ученика с его сдачей',
      metadata: userRoute('student:assignments.view'),
    },
    getStudentHomework: {
      method: 'GET',
      path: '/student/homework',
      responses: { 200: StudentHomeworkDtoSchema },
      summary: 'Домашние задания ученика: кружки с открытыми заданиями и баллами',
      metadata: userRoute('student:assignments.view'),
    },
    submitAssignment: {
      method: 'POST',
      path: '/student/assignments/:assignmentId/submit',
      pathParams: z.object({ assignmentId: IdSchema }),
      headers: IdempotencyKeyHeadersSchema,
      body: SubmitAssignmentBodySchema,
      responses: { 200: SubmissionDtoSchema },
      summary: 'Сдать задание (Idempotency-Key)',
      metadata: userRoute('student:assignments.submit'),
    },
    listTeacherAssignments: {
      method: 'GET',
      path: '/teacher/assignments',
      query: ListTeacherAssignmentsQuerySchema,
      responses: { 200: paginated(TeacherAssignmentCardSchema) },
      summary: 'Задания преподавателя с фильтрами',
      metadata: userRoute('teacher:assignments.manage'),
    },
    createAssignment: {
      method: 'POST',
      path: '/teacher/assignments',
      body: CreateAssignmentBodySchema,
      responses: { 200: TeacherAssignmentCardSchema },
      summary: 'Создать простое задание (не из блока курса)',
      metadata: userRoute('teacher:assignments.manage'),
    },
    updateAssignment: {
      method: 'PATCH',
      path: '/teacher/assignments/:assignmentId',
      pathParams: z.object({ assignmentId: IdSchema }),
      body: UpdateAssignmentBodySchema,
      responses: { 200: TeacherAssignmentCardSchema },
      summary: 'Изменить задание или опубликовать его',
      metadata: userRoute('teacher:assignments.manage'),
    },
    deleteAssignment: {
      method: 'DELETE',
      path: '/teacher/assignments/:assignmentId',
      pathParams: z.object({ assignmentId: IdSchema }),
      body: c.noBody(),
      responses: { 204: c.noBody() },
      summary: 'Удалить задание (мягко)',
      metadata: userRoute('teacher:assignments.manage'),
    },
    listSubmissions: {
      method: 'GET',
      path: '/teacher/assignments/:assignmentId/submissions',
      pathParams: z.object({ assignmentId: IdSchema }),
      responses: { 200: AssignmentSubmissionsSchema },
      summary: 'Сдачи по заданию по всем ученикам группы',
      metadata: userRoute('teacher:submissions.grade'),
    },
    getSubmission: {
      method: 'GET',
      path: '/teacher/submissions/:submissionId',
      pathParams: z.object({ submissionId: IdSchema }),
      responses: { 200: TeacherSubmissionDetailSchema },
      summary: 'Сдача с ответами, файлами и попытками',
      metadata: userRoute('teacher:submissions.grade'),
    },
    gradeSubmission: {
      method: 'POST',
      path: '/teacher/submissions/:submissionId/grade',
      pathParams: z.object({ submissionId: IdSchema }),
      body: GradeSubmissionBodySchema,
      responses: { 200: SubmissionDtoSchema },
      summary: 'Оценить сдачу или вернуть на доработку',
      metadata: userRoute('teacher:submissions.grade'),
    },
  },
  contractRouterOptions,
);
