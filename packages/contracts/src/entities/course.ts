import { z } from 'zod';
import { BlockProgressStatusSchema, CourseStatusSchema } from '../enums';
import { DateTimeSchema, IdSchema, PercentSchema } from '../common/primitives';
import {
  FileContentSchema,
  HomeworkContentSchema,
  ImageContentSchema,
  InteractiveContentSchema,
  PracticeContentSchema,
  QuestionContentSchema,
  QuizContentForStudentSchema,
  QuizContentSchema,
  TextContentSchema,
  VideoContentSchema,
} from '../blocks';

export const CourseSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  teacherId: IdSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: CourseStatusSchema,
  version: z.number().int().positive(),
  publishedAt: DateTimeSchema.nullable(),
  generationJobId: IdSchema.nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseModuleSchema = z.object({
  id: IdSchema,
  courseId: IdSchema,
  order: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string().nullable(),
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

const blockBase = {
  id: IdSchema,
  moduleId: IdSchema,
  order: z.number().int().nonnegative(),
  title: z.string(),
  estimatedMinutes: z.number().int().nonnegative().nullable(),
  isRequired: z.boolean(),
};

/** Блок курса с полным содержимым (преподаватель). Дискриминатор — type. */
export const CourseBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...blockBase, type: z.literal('TEXT'), content: TextContentSchema }),
  z.object({ ...blockBase, type: z.literal('VIDEO'), content: VideoContentSchema }),
  z.object({ ...blockBase, type: z.literal('IMAGE'), content: ImageContentSchema }),
  z.object({ ...blockBase, type: z.literal('FILE'), content: FileContentSchema }),
  z.object({ ...blockBase, type: z.literal('QUIZ'), content: QuizContentSchema }),
  z.object({ ...blockBase, type: z.literal('QUESTION'), content: QuestionContentSchema }),
  z.object({ ...blockBase, type: z.literal('PRACTICE'), content: PracticeContentSchema }),
  z.object({ ...blockBase, type: z.literal('HOMEWORK'), content: HomeworkContentSchema }),
  z.object({ ...blockBase, type: z.literal('INTERACTIVE'), content: InteractiveContentSchema }),
]);
export type CourseBlock = z.infer<typeof CourseBlockSchema>;

/** Блок для ученика: QUIZ без правильных ответов. */
export const CourseBlockForStudentSchema = z.discriminatedUnion('type', [
  z.object({ ...blockBase, type: z.literal('TEXT'), content: TextContentSchema }),
  z.object({ ...blockBase, type: z.literal('VIDEO'), content: VideoContentSchema }),
  z.object({ ...blockBase, type: z.literal('IMAGE'), content: ImageContentSchema }),
  z.object({ ...blockBase, type: z.literal('FILE'), content: FileContentSchema }),
  z.object({ ...blockBase, type: z.literal('QUIZ'), content: QuizContentForStudentSchema }),
  z.object({ ...blockBase, type: z.literal('QUESTION'), content: QuestionContentSchema }),
  z.object({ ...blockBase, type: z.literal('PRACTICE'), content: PracticeContentSchema }),
  z.object({ ...blockBase, type: z.literal('HOMEWORK'), content: HomeworkContentSchema }),
  z.object({ ...blockBase, type: z.literal('INTERACTIVE'), content: InteractiveContentSchema }),
]);
export type CourseBlockForStudent = z.infer<typeof CourseBlockForStudentSchema>;

export const BlockProgressSchema = z.object({
  studentId: IdSchema,
  blockId: IdSchema,
  status: BlockProgressStatusSchema,
  openedAt: DateTimeSchema,
  completedAt: DateTimeSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  score: z.number().int().nullable(),
});
export type BlockProgress = z.infer<typeof BlockProgressSchema>;

/** Прогресс ученика по курсу (StudentProgress в терминах продукта). */
export const CourseProgressSchema = z.object({
  studentId: IdSchema,
  courseId: IdSchema,
  completedBlocks: z.number().int().nonnegative(),
  totalBlocks: z.number().int().nonnegative(),
  percent: PercentSchema,
  lastActivityAt: DateTimeSchema.nullable(),
});
export type CourseProgress = z.infer<typeof CourseProgressSchema>;
export const StudentProgressSchema = CourseProgressSchema;
export type StudentProgress = CourseProgress;

/** Черновик курса: вход `PUT /teacher/courses/:id/structure` и результат генерации. */
const draftBlockBase = {
  id: IdSchema.optional(),
  title: z.string().min(1),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  isRequired: z.boolean().optional(),
};
export const CourseDraftBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...draftBlockBase, type: z.literal('TEXT'), content: TextContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('VIDEO'), content: VideoContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('IMAGE'), content: ImageContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('FILE'), content: FileContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('QUIZ'), content: QuizContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('QUESTION'), content: QuestionContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('PRACTICE'), content: PracticeContentSchema }),
  z.object({ ...draftBlockBase, type: z.literal('HOMEWORK'), content: HomeworkContentSchema }),
  z.object({
    ...draftBlockBase,
    type: z.literal('INTERACTIVE'),
    content: InteractiveContentSchema,
  }),
]);
export const CourseDraftModuleSchema = z.object({
  id: IdSchema.optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  sourceRefs: z.array(z.string()).optional(),
  blocks: z.array(CourseDraftBlockSchema),
});
export const CourseDraftSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  modules: z.array(CourseDraftModuleSchema),
});
export type CourseDraft = z.infer<typeof CourseDraftSchema>;
export type CourseDraftModule = z.infer<typeof CourseDraftModuleSchema>;
export type CourseDraftBlock = z.infer<typeof CourseDraftBlockSchema>;
