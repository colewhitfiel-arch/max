import { z } from 'zod';
import { AttendanceStatusSchema, LessonStatusSchema } from '../enums';
import { DateTimeSchema, IdSchema } from '../common/primitives';
import { GroupBriefSchema } from './group';

/** Занятие (ScheduleEvent в терминах продукта). */
export const LessonSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  ruleId: IdSchema.nullable(),
  startsAt: DateTimeSchema,
  endsAt: DateTimeSchema,
  topic: z.string().nullable(),
  room: z.string().nullable(),
  status: LessonStatusSchema,
  cancelReason: z.string().nullable(),
});
export type Lesson = z.infer<typeof LessonSchema>;
export const ScheduleEventSchema = LessonSchema;
export type ScheduleEvent = Lesson;

/** Занятие в ответах API: с группой и (для ученика/родителя) статусом посещения. */
export const LessonDtoSchema = LessonSchema.extend({
  group: GroupBriefSchema,
  attendance: AttendanceStatusSchema.nullable().optional(),
});
export type LessonDto = z.infer<typeof LessonDtoSchema>;

export const AttendanceSchema = z.object({
  id: IdSchema,
  lessonId: IdSchema,
  studentId: IdSchema,
  status: AttendanceStatusSchema,
  comment: z.string().nullable(),
  markedById: IdSchema,
  markedAt: DateTimeSchema,
});
export type Attendance = z.infer<typeof AttendanceSchema>;
