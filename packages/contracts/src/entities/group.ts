import { z } from 'zod';
import { EnrollmentStatusSchema } from '../enums';
import { DateOnlySchema, DateTimeSchema, IdSchema, TimeOfDaySchema } from '../common/primitives';
import { ClubBriefSchema } from './club';
import { TeacherBriefSchema } from './profiles';

export const GroupSchema = z.object({
  id: IdSchema,
  clubId: IdSchema,
  teacherId: IdSchema,
  title: z.string(),
  isActive: z.boolean(),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupBriefSchema = z.object({
  id: IdSchema,
  title: z.string(),
  club: ClubBriefSchema,
  teacher: TeacherBriefSchema,
});
export type GroupBrief = z.infer<typeof GroupBriefSchema>;

export const EnrollmentSchema = z.object({
  id: IdSchema,
  studentId: IdSchema,
  groupId: IdSchema,
  status: EnrollmentStatusSchema,
  enrolledAt: DateTimeSchema,
  leftAt: DateTimeSchema.nullable(),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

export const ScheduleRuleSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  /** 0 — воскресенье … 6 — суббота (как в JS Date#getDay) */
  weekday: z.number().int().min(0).max(6),
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
  room: z.string().nullable(),
  validFrom: DateOnlySchema,
  validTo: DateOnlySchema.nullable(),
});
export type ScheduleRule = z.infer<typeof ScheduleRuleSchema>;

export const ScheduleRuleDtoSchema = ScheduleRuleSchema.pick({
  id: true,
  weekday: true,
  startTime: true,
  endTime: true,
  room: true,
});
export type ScheduleRuleDto = z.infer<typeof ScheduleRuleDtoSchema>;
