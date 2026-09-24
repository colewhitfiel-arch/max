import { z } from 'zod';
import { IdSchema } from '../common/primitives';

export const SchoolSettingsSchema = z.object({
  showTeacherContacts: z.boolean(),
});
export type SchoolSettings = z.infer<typeof SchoolSettingsSchema>;

/** true — IANA-пояс, который знает среда исполнения (`Europe/Moscow`). */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('ru', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const SchoolSchema = z.object({
  id: IdSchema,
  name: z.string(),
  /** IANA-пояс школы; в нём считаются «сегодня», недели и дни серии. */
  timezone: z.string().min(1).refine(isKnownTimeZone, { message: 'Неизвестный часовой пояс' }),
  settings: SchoolSettingsSchema,
});
export type School = z.infer<typeof SchoolSchema>;

export const SchoolBriefSchema = SchoolSchema.pick({ id: true, name: true });
export type SchoolBrief = z.infer<typeof SchoolBriefSchema>;
