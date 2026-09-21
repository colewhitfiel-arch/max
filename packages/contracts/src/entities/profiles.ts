import { z } from 'zod';
import { DateTimeSchema, IdSchema } from '../common/primitives';
import { UserBriefSchema } from './user';

export const StudentProfileSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  schoolId: IdSchema.nullable(),
  classLabel: z.string().nullable(),
  birthYear: z.number().int().nullable(),
  interests: z.array(z.string()),
  goals: z.array(z.string()),
  weeklyHours: z.number().int().nullable(),
  preferredFormats: z.array(z.string()),
  aiProfileSummary: z.string().nullable(),
  onboardingCompletedAt: DateTimeSchema.nullable(),
  linkCode: z.string(),
});
export type StudentProfile = z.infer<typeof StudentProfileSchema>;

export const ParentProfileSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
});
export type ParentProfile = z.infer<typeof ParentProfileSchema>;

export const TeacherProfileSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  schoolId: IdSchema,
  qualification: z.string().nullable(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  contactsVisible: z.boolean(),
});
export type TeacherProfile = z.infer<typeof TeacherProfileSchema>;

export const TeacherContactsSchema = z.object({
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type TeacherContacts = z.infer<typeof TeacherContactsSchema>;

/** Ученик для вложения в списки: id — это StudentProfile.id. */
export const StudentBriefSchema = z.object({
  id: IdSchema,
  user: UserBriefSchema,
  classLabel: z.string().nullable(),
});
export type StudentBrief = z.infer<typeof StudentBriefSchema>;

/** Преподаватель для вложения: id — это TeacherProfile.id. */
export const TeacherBriefSchema = z.object({
  id: IdSchema,
  user: UserBriefSchema,
  photoUrl: z.string().nullable(),
});
export type TeacherBrief = z.infer<typeof TeacherBriefSchema>;
