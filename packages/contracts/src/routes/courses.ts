/**
 * Курсы и блоки: просмотр учеником, конструктор структуры преподавателем. Владелец — B4.
 * docs/05-api-contracts.md §5.3 `courses.ts`; содержимое блоков — `src/blocks`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  BlockAnswersSchema,
  FileContentSchema,
  HomeworkContentSchema,
  ImageContentSchema,
  InteractiveContentSchema,
  PracticeContentSchema,
  QuestionContentSchema,
  QuizContentSchema,
  TextContentSchema,
  VideoContentSchema,
} from '../blocks';
import { DateTimeSchema, IdSchema, PercentSchema } from '../common';
import {
  type BlockType,
  BlockProgressStatusSchema,
  BlockTypeSchema,
  CourseStatusSchema,
} from '../enums';
import {
  AssignmentBriefSchema,
  CourseBlockForStudentSchema,
  CourseBlockSchema,
  CourseDraftSchema,
  CourseProgressSchema,
  GroupBriefSchema,
  StudentBriefSchema,
} from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- Ученик: DTO ----------

/** Прогресс по курсу без привязки к ученику. */
export const CourseProgressBriefSchema = CourseProgressSchema.pick({
  percent: true,
  completedBlocks: true,
  totalBlocks: true,
});
export type CourseProgressBrief = z.infer<typeof CourseProgressBriefSchema>;

export const NextBlockSchema = z.object({
  id: IdSchema,
  title: z.string(),
  type: BlockTypeSchema,
});
export type NextBlock = z.infer<typeof NextBlockSchema>;

export const StudentCourseCardSchema = z.object({
  id: IdSchema,
  title: z.string(),
  group: GroupBriefSchema,
  progress: CourseProgressBriefSchema,
  nextBlock: NextBlockSchema.nullable(),
});
export type StudentCourseCard = z.infer<typeof StudentCourseCardSchema>;

export const StudentCoursesListSchema = z.object({ items: z.array(StudentCourseCardSchema) });
export type StudentCoursesList = z.infer<typeof StudentCoursesListSchema>;

export const StudentCourseBlockItemSchema = z.object({
  id: IdSchema,
  title: z.string(),
  type: BlockTypeSchema,
  order: z.number().int().nonnegative(),
  estimatedMinutes: z.number().int().nonnegative().nullable(),
  isRequired: z.boolean(),
  /** null — ученик ещё не открывал блок. */
  progress: BlockProgressStatusSchema.nullable(),
});
export type StudentCourseBlockItem = z.infer<typeof StudentCourseBlockItemSchema>;

export const StudentCourseModuleSchema = z.object({
  id: IdSchema,
  title: z.string(),
  order: z.number().int().nonnegative(),
  blocks: z.array(StudentCourseBlockItemSchema),
});
export type StudentCourseModule = z.infer<typeof StudentCourseModuleSchema>;

export const StudentCourseDetailSchema = z.object({
  id: IdSchema,
  title: z.string(),
  description: z.string().nullable(),
  group: GroupBriefSchema,
  modules: z.array(StudentCourseModuleSchema),
});
export type StudentCourseDetail = z.infer<typeof StudentCourseDetailSchema>;

export const BlockProgressBriefSchema = z.object({
  status: BlockProgressStatusSchema,
  attempts: z.number().int().nonnegative(),
  score: z.number().int().nullable(),
});
export type BlockProgressBrief = z.infer<typeof BlockProgressBriefSchema>;

/**
 * Блок для ученика: содержимое по типу без ответов (QUIZ — без правильных вариантов и пояснений,
 * QUESTION — без эталона и критериев; см. `toStudentBlock`) + задание и прогресс.
 */
export const StudentBlockDetailSchema = z.intersection(
  CourseBlockForStudentSchema,
  z.object({
    courseId: IdSchema,
    assignment: AssignmentBriefSchema.nullable(),
    progress: BlockProgressBriefSchema.nullable(),
  }),
);
export type StudentBlockDetail = z.infer<typeof StudentBlockDetailSchema>;

export const OpenBlockResultSchema = z.object({ progress: BlockProgressBriefSchema });
export type OpenBlockResult = z.infer<typeof OpenBlockResultSchema>;

export const CompleteBlockResultSchema = z.object({
  progress: BlockProgressBriefSchema,
  /** Балл автопроверки QUIZ; null для остальных типов. */
  score: z.number().int().nullable(),
  courseProgress: CourseProgressBriefSchema,
});
export type CompleteBlockResult = z.infer<typeof CompleteBlockResultSchema>;

// ---------- Ученик: тела запросов ----------

export const CompleteBlockBodySchema = z.object({
  answers: BlockAnswersSchema.optional(),
});
export type CompleteBlockBody = z.infer<typeof CompleteBlockBodySchema>;

// ---------- Преподаватель: DTO ----------

export const CourseBlockDtoSchema = CourseBlockSchema;
export type CourseBlockDto = z.infer<typeof CourseBlockDtoSchema>;

export const TeacherCourseCardSchema = z.object({
  id: IdSchema,
  title: z.string(),
  group: GroupBriefSchema,
  status: CourseStatusSchema,
  modulesCount: z.number().int().nonnegative(),
  blocksCount: z.number().int().nonnegative(),
  publishedAt: DateTimeSchema.nullable(),
  avgProgress: PercentSchema,
});
export type TeacherCourseCard = z.infer<typeof TeacherCourseCardSchema>;

export const TeacherCoursesListSchema = z.object({ items: z.array(TeacherCourseCardSchema) });
export type TeacherCoursesList = z.infer<typeof TeacherCoursesListSchema>;

export const TeacherCourseModuleSchema = z.object({
  id: IdSchema,
  title: z.string(),
  summary: z.string().nullable(),
  order: z.number().int().nonnegative(),
  blocks: z.array(CourseBlockDtoSchema),
});
export type TeacherCourseModule = z.infer<typeof TeacherCourseModuleSchema>;

export const TeacherCourseDetailSchema = z.object({
  id: IdSchema,
  title: z.string(),
  description: z.string().nullable(),
  group: GroupBriefSchema,
  status: CourseStatusSchema,
  version: z.number().int().positive(),
  publishedAt: DateTimeSchema.nullable(),
  modules: z.array(TeacherCourseModuleSchema),
});
export type TeacherCourseDetail = z.infer<typeof TeacherCourseDetailSchema>;

export const CourseProgressStudentRowSchema = z.object({
  student: StudentBriefSchema,
  percent: PercentSchema,
  completedBlocks: z.number().int().nonnegative(),
  lastActivityAt: DateTimeSchema.nullable(),
});
export type CourseProgressStudentRow = z.infer<typeof CourseProgressStudentRowSchema>;

export const CourseProgressReportSchema = z.object({
  students: z.array(CourseProgressStudentRowSchema),
});
export type CourseProgressReport = z.infer<typeof CourseProgressReportSchema>;

// ---------- Преподаватель: query и тела запросов ----------

export const ListTeacherCoursesQuerySchema = z.object({
  groupId: IdSchema.optional(),
});
export type ListTeacherCoursesQuery = z.infer<typeof ListTeacherCoursesQuerySchema>;

export const CreateCourseBodySchema = z.object({
  groupId: IdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
});
export type CreateCourseBody = z.infer<typeof CreateCourseBodySchema>;

/** Полная замена структуры; допустимо только для курса в DRAFT. */
export const ReplaceCourseStructureBodySchema = CourseDraftSchema;
export type ReplaceCourseStructureBody = z.infer<typeof ReplaceCourseStructureBodySchema>;

const patchBlock = <T extends BlockType, C extends z.ZodTypeAny>(type: T, content: C) =>
  z.object({
    type: z.literal(type),
    title: z.string().min(1).optional(),
    content: content.optional(),
  });

/**
 * Правка блока (разрешена и после публикации — только тексты). `type` обязателен: содержимое
 * IMAGE/FILE и т.п. нельзя различить без дискриминатора; сервер сверяет его с типом блока в БД.
 */
export const UpdateBlockBodySchema = z.discriminatedUnion('type', [
  patchBlock('TEXT', TextContentSchema),
  patchBlock('VIDEO', VideoContentSchema),
  patchBlock('IMAGE', ImageContentSchema),
  patchBlock('FILE', FileContentSchema),
  patchBlock('QUIZ', QuizContentSchema),
  patchBlock('QUESTION', QuestionContentSchema),
  patchBlock('PRACTICE', PracticeContentSchema),
  patchBlock('HOMEWORK', HomeworkContentSchema),
  patchBlock('INTERACTIVE', InteractiveContentSchema),
]);
export type UpdateBlockBody = z.infer<typeof UpdateBlockBodySchema>;

export const PublishBlockAssignmentSchema = z.object({
  blockId: IdSchema,
  dueAt: DateTimeSchema.optional(),
  maxScore: z.number().int().positive().optional(),
  allowedAttempts: z.number().int().positive().optional(),
});
export type PublishBlockAssignment = z.infer<typeof PublishBlockAssignmentSchema>;

/** Параметры заданий для блоков-заданий (QUIZ/QUESTION/PRACTICE/HOMEWORK) при публикации. */
export const PublishCourseBodySchema = z.object({
  assignments: z.array(PublishBlockAssignmentSchema),
});
export type PublishCourseBody = z.infer<typeof PublishCourseBodySchema>;

// ---------- Роуты ----------

export const coursesContract = c.router(
  {
    listStudentCourses: {
      method: 'GET',
      path: '/student/courses',
      responses: { 200: StudentCoursesListSchema },
      summary: 'Курсы ученика с прогрессом',
      metadata: userRoute('student:courses.view'),
    },
    getStudentCourse: {
      method: 'GET',
      path: '/student/courses/:courseId',
      pathParams: z.object({ courseId: IdSchema }),
      responses: { 200: StudentCourseDetailSchema },
      summary: 'Структура курса для ученика с прогрессом по блокам',
      metadata: userRoute('student:courses.view'),
    },
    getStudentBlock: {
      method: 'GET',
      path: '/student/blocks/:blockId',
      pathParams: z.object({ blockId: IdSchema }),
      responses: { 200: StudentBlockDetailSchema },
      summary: 'Блок курса для ученика (QUIZ без правильных ответов)',
      metadata: userRoute('student:courses.view'),
    },
    openBlock: {
      method: 'POST',
      path: '/student/blocks/:blockId/open',
      pathParams: z.object({ blockId: IdSchema }),
      body: c.noBody(),
      responses: { 200: OpenBlockResultSchema },
      summary: 'Отметить открытие блока',
      metadata: userRoute('student:blocks.complete'),
    },
    completeBlock: {
      method: 'POST',
      path: '/student/blocks/:blockId/complete',
      pathParams: z.object({ blockId: IdSchema }),
      body: CompleteBlockBodySchema,
      responses: { 200: CompleteBlockResultSchema },
      summary: 'Завершить блок (QUIZ проверяется, блоки-задания сдаются через assignments)',
      metadata: userRoute('student:blocks.complete'),
    },
    listTeacherCourses: {
      method: 'GET',
      path: '/teacher/courses',
      query: ListTeacherCoursesQuerySchema,
      responses: { 200: TeacherCoursesListSchema },
      summary: 'Курсы преподавателя (фильтр по группе)',
      metadata: userRoute('teacher:courses.manage'),
    },
    createCourse: {
      method: 'POST',
      path: '/teacher/courses',
      body: CreateCourseBodySchema,
      responses: { 200: TeacherCourseDetailSchema },
      summary: 'Создать пустой курс (DRAFT) для группы',
      metadata: userRoute('teacher:courses.manage'),
    },
    getTeacherCourse: {
      method: 'GET',
      path: '/teacher/courses/:courseId',
      pathParams: z.object({ courseId: IdSchema }),
      responses: { 200: TeacherCourseDetailSchema },
      summary: 'Курс с полной структурой и содержимым блоков',
      metadata: userRoute('teacher:courses.manage'),
    },
    replaceCourseStructure: {
      method: 'PUT',
      path: '/teacher/courses/:courseId/structure',
      pathParams: z.object({ courseId: IdSchema }),
      body: ReplaceCourseStructureBodySchema,
      responses: { 200: TeacherCourseDetailSchema },
      summary: 'Полностью заменить структуру курса (только DRAFT)',
      metadata: userRoute('teacher:courses.manage'),
    },
    updateBlock: {
      method: 'PATCH',
      path: '/teacher/blocks/:blockId',
      pathParams: z.object({ blockId: IdSchema }),
      body: UpdateBlockBodySchema,
      responses: { 200: CourseBlockDtoSchema },
      summary: 'Изменить заголовок/содержимое блока (можно после публикации)',
      metadata: userRoute('teacher:courses.manage'),
    },
    publishCourse: {
      method: 'POST',
      path: '/teacher/courses/:courseId/publish',
      pathParams: z.object({ courseId: IdSchema }),
      body: PublishCourseBodySchema,
      responses: { 200: TeacherCourseDetailSchema },
      summary: 'Опубликовать курс и создать задания из блоков',
      metadata: userRoute('teacher:courses.manage'),
    },
    archiveCourse: {
      method: 'POST',
      path: '/teacher/courses/:courseId/archive',
      pathParams: z.object({ courseId: IdSchema }),
      body: c.noBody(),
      responses: { 200: TeacherCourseDetailSchema },
      summary: 'Архивировать курс',
      metadata: userRoute('teacher:courses.manage'),
    },
    getCourseProgress: {
      method: 'GET',
      path: '/teacher/courses/:courseId/progress',
      pathParams: z.object({ courseId: IdSchema }),
      responses: { 200: CourseProgressReportSchema },
      summary: 'Прогресс учеников по курсу',
      metadata: userRoute('teacher:courses.manage'),
    },
  },
  contractRouterOptions,
);
