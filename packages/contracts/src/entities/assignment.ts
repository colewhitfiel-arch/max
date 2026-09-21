import { z } from 'zod';
import { AssignmentTypeSchema, SubmissionStatusSchema } from '../enums';
import { DateTimeSchema, IdSchema } from '../common/primitives';
import { BlockAnswersSchema } from '../blocks';
import { GroupBriefSchema } from './group';

export const AssignmentSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  teacherId: IdSchema,
  courseId: IdSchema.nullable(),
  blockId: IdSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: AssignmentTypeSchema,
  dueAt: DateTimeSchema.nullable(),
  maxScore: z.number().int().positive(),
  allowedAttempts: z.number().int().positive().nullable(),
  publishedAt: DateTimeSchema.nullable(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const SubmissionSchema = z.object({
  id: IdSchema,
  assignmentId: IdSchema,
  studentId: IdSchema,
  status: SubmissionStatusSchema,
  attemptsCount: z.number().int().nonnegative(),
  score: z.number().int().nullable(),
  answers: BlockAnswersSchema.nullable(),
  fileIds: z.array(IdSchema),
  text: z.string().nullable(),
  submittedAt: DateTimeSchema.nullable(),
  gradedAt: DateTimeSchema.nullable(),
  gradedById: IdSchema.nullable(),
  feedback: z.string().nullable(),
  isLate: z.boolean(),
});
export type Submission = z.infer<typeof SubmissionSchema>;

export const SubmissionAttemptSchema = z.object({
  id: IdSchema,
  submissionId: IdSchema,
  n: z.number().int().positive(),
  answers: BlockAnswersSchema,
  score: z.number().int().nullable(),
  submittedAt: DateTimeSchema,
});
export type SubmissionAttempt = z.infer<typeof SubmissionAttemptSchema>;

export const SubmissionBriefSchema = SubmissionSchema.pick({
  status: true,
  score: true,
  isLate: true,
  submittedAt: true,
});
export type SubmissionBrief = z.infer<typeof SubmissionBriefSchema>;

/** Задание в списках/дашбордах: с группой и (для ученика) его сдачей. */
export const AssignmentBriefSchema = AssignmentSchema.pick({
  id: true,
  title: true,
  type: true,
  dueAt: true,
  maxScore: true,
}).extend({
  group: GroupBriefSchema,
  submission: SubmissionBriefSchema.nullable().optional(),
});
export type AssignmentBrief = z.infer<typeof AssignmentBriefSchema>;
