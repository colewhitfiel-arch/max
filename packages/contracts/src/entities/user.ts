import { z } from 'zod';
import { LocaleSchema, ThemeSchema } from '../enums';
import { DateTimeSchema, IdSchema } from '../common/primitives';

export const UserSchema = z.object({
  id: IdSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  locale: LocaleSchema,
  theme: ThemeSchema,
  createdAt: DateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

/** Минимальное представление пользователя для вложения в другие DTO. */
export const UserBriefSchema = UserSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatarUrl: true,
});
export type UserBrief = z.infer<typeof UserBriefSchema>;

export const UserSettingsSchema = z.object({ theme: ThemeSchema, locale: LocaleSchema });
export type UserSettings = z.infer<typeof UserSettingsSchema>;
