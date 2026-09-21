import { z } from 'zod';
import { LinkStatusSchema } from '../enums';
import { DateTimeSchema, IdSchema } from '../common/primitives';
import { StudentBriefSchema } from './profiles';
import { SchoolBriefSchema } from './school';

export const ParentStudentLinkSchema = z.object({
  parentId: IdSchema,
  studentId: IdSchema,
  status: LinkStatusSchema,
  requestedAt: DateTimeSchema,
  confirmedAt: DateTimeSchema.nullable(),
});
export type ParentStudentLink = z.infer<typeof ParentStudentLinkSchema>;

/** Ребёнок в списке родителя. */
export const ChildBriefSchema = z.object({
  student: StudentBriefSchema,
  linkStatus: LinkStatusSchema,
  school: SchoolBriefSchema.nullable(),
});
export type ChildBrief = z.infer<typeof ChildBriefSchema>;
