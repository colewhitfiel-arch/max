/**
 * Доменные события (docs/05-api-contracts.md §5.4). Владелец — contracts.
 * Событие описывает факт, payload самодостаточен, обработчики идемпотентны.
 */
import { z } from 'zod';
import { AssignmentTypeSchema, AttendanceStatusSchema, SubmissionStatusSchema } from './enums';
import { DateTimeSchema, IdSchema } from './common/primitives';

const at = DateTimeSchema;

export const DomainEventSchemas = {
  'attendance.marked': z.object({
    lessonId: IdSchema,
    groupId: IdSchema,
    rows: z.array(z.object({ studentId: IdSchema, status: AttendanceStatusSchema })),
    markedById: IdSchema,
    at,
  }),
  'submission.submitted': z.object({
    submissionId: IdSchema,
    assignmentId: IdSchema,
    studentId: IdSchema,
    groupId: IdSchema,
    isLate: z.boolean(),
    attempt: z.number().int().positive(),
    at,
  }),
  'submission.graded': z.object({
    submissionId: IdSchema,
    assignmentId: IdSchema,
    studentId: IdSchema,
    groupId: IdSchema,
    score: z.number().int(),
    maxScore: z.number().int(),
    status: SubmissionStatusSchema,
    at,
  }),
  'block.opened': z.object({ studentId: IdSchema, blockId: IdSchema, courseId: IdSchema, at }),
  'block.completed': z.object({
    studentId: IdSchema,
    blockId: IdSchema,
    courseId: IdSchema,
    score: z.number().int().optional(),
    at,
  }),
  'course.published': z.object({
    courseId: IdSchema,
    groupId: IdSchema,
    teacherId: IdSchema,
    blockAssignments: z.array(
      z.object({
        blockId: IdSchema,
        type: AssignmentTypeSchema,
        title: z.string(),
        dueAt: DateTimeSchema.optional(),
        maxScore: z.number().int().positive().optional(),
        allowedAttempts: z.number().int().positive().optional(),
      }),
    ),
    at,
  }),
  'lesson.cancelled': z.object({ lessonId: IdSchema, groupId: IdSchema, at }),
  'enrollment.created': z.object({
    enrollmentId: IdSchema,
    studentId: IdSchema,
    groupId: IdSchema,
    at,
  }),
  'payment.succeeded': z.object({
    paymentId: IdSchema,
    enrollmentId: IdSchema,
    studentId: IdSchema,
    parentId: IdSchema,
    periodsCount: z.number().int().positive(),
    at,
  }),
  'payment.failed': z.object({ paymentId: IdSchema, parentId: IdSchema, at }),
  'generation.finished': z.object({
    jobId: IdSchema,
    teacherId: IdSchema,
    stage: z.enum(['READY', 'FAILED']),
    at,
  }),
  'student.profile.updated': z.object({ studentId: IdSchema, at }),
  'tutor.message.sent': z.object({ studentId: IdSchema, conversationId: IdSchema, at }),
  'app.opened': z.object({ userId: IdSchema, studentId: IdSchema.optional(), at }),
} as const;

export type DomainEventName = keyof typeof DomainEventSchemas;
export type DomainEventPayload<N extends DomainEventName> = z.infer<(typeof DomainEventSchemas)[N]>;
export type DomainEvent<N extends DomainEventName = DomainEventName> = {
  name: N;
  payload: DomainEventPayload<N>;
};
export const DOMAIN_EVENT_NAMES = Object.keys(DomainEventSchemas) as DomainEventName[];
