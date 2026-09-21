/**
 * Схемы содержимого блоков курса (CourseBlock.content) по типу. Владелец — B4 (courses).
 * См. docs/04-data-model.md §4.4.
 */
import { z } from 'zod';
import { IdSchema } from '../common/primitives';

export const TextContentSchema = z.object({ markdown: z.string() });

export const VideoContentSchema = z.object({
  url: z.string().url().optional(),
  provider: z.enum(['youtube', 'vk', 'rutube', 'file']),
  fileId: IdSchema.optional(),
  durationSec: z.number().int().nonnegative().optional(),
});

export const ImageContentSchema = z.object({ fileId: IdSchema, caption: z.string().optional() });

export const FileContentSchema = z.object({ fileId: IdSchema, description: z.string().optional() });

export const QuizOptionSchema = z.object({ id: z.string(), text: z.string() });
export const QuizQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(QuizOptionSchema).min(2),
  correctOptionIds: z.array(z.string()).min(1),
  explanation: z.string().optional(),
  multiple: z.boolean(),
});
export const QuizContentSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1),
  passScore: z.number().int().min(0).max(100),
});
/** Вариант QUIZ для ученика: без правильных ответов и пояснений. */
export const QuizContentForStudentSchema = z.object({
  questions: z.array(QuizQuestionSchema.omit({ correctOptionIds: true, explanation: true })),
  passScore: z.number().int().min(0).max(100),
});
export const QuizAnswersSchema = z.record(z.string(), z.array(z.string()));

export const QuestionContentSchema = z.object({
  prompt: z.string(),
  expectedAnswer: z.string().optional(),
  rubric: z.string().optional(),
});

export const SubmissionTypeSchema = z.enum(['TEXT', 'FILE', 'BOTH']);
export const PracticeContentSchema = z.object({
  instructions: z.string(),
  submissionType: SubmissionTypeSchema,
});

export const HomeworkContentSchema = z.object({
  instructions: z.string(),
  submissionType: z.enum(['TEXT', 'FILE', 'BOTH', 'NONE']),
});

export const FlashcardsDataSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })).min(1),
});
export const MatchingDataSchema = z.object({
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2),
});
export const FillGapsDataSchema = z.object({
  /** Текст с пропусками вида {{answer}} */
  text: z.string(),
});
export const InteractiveContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('FLASHCARDS'), data: FlashcardsDataSchema }),
  z.object({ kind: z.literal('MATCHING'), data: MatchingDataSchema }),
  z.object({ kind: z.literal('FILL_GAPS'), data: FillGapsDataSchema }),
]);

/** Ответ ученика на блок/задание (Submission.answers). */
export const FreeAnswersSchema = z.object({
  text: z.string().optional(),
  fileIds: z.array(IdSchema).optional(),
});
export const BlockAnswersSchema = z.union([QuizAnswersSchema, FreeAnswersSchema]);

export type TextContent = z.infer<typeof TextContentSchema>;
export type VideoContent = z.infer<typeof VideoContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
export type QuizContent = z.infer<typeof QuizContentSchema>;
export type QuizContentForStudent = z.infer<typeof QuizContentForStudentSchema>;
export type QuizAnswers = z.infer<typeof QuizAnswersSchema>;
export type QuestionContent = z.infer<typeof QuestionContentSchema>;
export type PracticeContent = z.infer<typeof PracticeContentSchema>;
export type HomeworkContent = z.infer<typeof HomeworkContentSchema>;
export type InteractiveContent = z.infer<typeof InteractiveContentSchema>;
export type FreeAnswers = z.infer<typeof FreeAnswersSchema>;
export type BlockAnswers = z.infer<typeof BlockAnswersSchema>;
