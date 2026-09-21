import { z } from 'zod';
import { ConversationKindSchema, InsightKindSchema, MessageRoleSchema } from '../enums';
import { DateOnlySchema, DateTimeSchema, IdSchema } from '../common/primitives';

export const AiConversationSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  studentId: IdSchema.nullable(),
  kind: ConversationKindSchema,
  title: z.string().nullable(),
  lastMessageAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type AiConversation = z.infer<typeof AiConversationSchema>;

export const AiMessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  role: MessageRoleSchema,
  content: z.string(),
  createdAt: DateTimeSchema,
});
export type AiMessage = z.infer<typeof AiMessageSchema>;

export const AiInsightSchema = z.object({
  kind: InsightKindSchema,
  studentId: IdSchema,
  periodFrom: DateOnlySchema,
  periodTo: DateOnlySchema,
  content: z.string(),
  generatedAt: DateTimeSchema,
});
export type AiInsight = z.infer<typeof AiInsightSchema>;

export const TrajectoryContentSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  growthAreas: z.array(z.string()),
  recommendations: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      clubId: IdSchema.optional(),
      courseId: IdSchema.optional(),
    }),
  ),
  nextSteps: z.array(z.string()),
});
export type TrajectoryContent = z.infer<typeof TrajectoryContentSchema>;

/** Персональная образовательная траектория (LearningTrajectory). */
export const TrajectorySchema = z.object({
  id: IdSchema,
  studentId: IdSchema,
  content: TrajectoryContentSchema,
  generatedAt: DateTimeSchema,
});
export type Trajectory = z.infer<typeof TrajectorySchema>;
export const LearningTrajectorySchema = TrajectorySchema;
export type LearningTrajectory = Trajectory;

/** События SSE-стрима ответа модели. */
export const AiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    messageId: IdSchema,
    isComplete: z.boolean().optional(),
    profileDraft: z.unknown().optional(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type AiStreamEvent = z.infer<typeof AiStreamEventSchema>;
