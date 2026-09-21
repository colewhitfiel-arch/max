import { z } from 'zod';
import {
  DateOnlySchema,
  DateTimeSchema,
  PercentSchema,
  PeriodSchema,
  RateSchema,
} from '../common/primitives';
import { ClubBriefSchema } from './club';
import { GroupBriefSchema } from './group';

export const StatsBriefSchema = z.object({
  attendanceRate: RateSchema,
  completionRate: RateSchema,
  activityScore: PercentSchema,
  absences: z.number().int().nonnegative(),
  lateCount: z.number().int().nonnegative(),
  period: PeriodSchema,
});
export type StatsBrief = z.infer<typeof StatsBriefSchema>;

export const ClubProgressSchema = z.object({
  club: ClubBriefSchema,
  group: GroupBriefSchema,
  percent: PercentSchema,
  attendanceRate: RateSchema,
  completionRate: RateSchema,
});
export type ClubProgress = z.infer<typeof ClubProgressSchema>;

export const WeeklyPointSchema = z.object({
  weekStart: DateOnlySchema,
  attendanceRate: RateSchema,
  completionRate: RateSchema,
  activityScore: PercentSchema,
});
export type WeeklyPoint = z.infer<typeof WeeklyPointSchema>;

/** Текст, сгенерированный ИИ, или null, если ещё не готов. */
export const AiTextSchema = z.object({ text: z.string(), generatedAt: DateTimeSchema }).nullable();
export type AiText = z.infer<typeof AiTextSchema>;
