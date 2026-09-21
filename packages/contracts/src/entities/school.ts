import { z } from 'zod';
import { IdSchema } from '../common/primitives';

export const SchoolSettingsSchema = z.object({
  showTeacherContacts: z.boolean(),
});
export type SchoolSettings = z.infer<typeof SchoolSettingsSchema>;

export const SchoolSchema = z.object({
  id: IdSchema,
  name: z.string(),
  timezone: z.string(),
  settings: SchoolSettingsSchema,
});
export type School = z.infer<typeof SchoolSchema>;

export const SchoolBriefSchema = SchoolSchema.pick({ id: true, name: true });
export type SchoolBrief = z.infer<typeof SchoolBriefSchema>;
