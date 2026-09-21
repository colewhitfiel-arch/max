import { z } from 'zod';
import { BillingPeriodSchema, ClubCategorySchema } from '../enums';
import { IdSchema, MoneySchema } from '../common/primitives';

export const ClubSchema = z.object({
  id: IdSchema,
  schoolId: IdSchema,
  title: z.string(),
  description: z.string(),
  category: ClubCategorySchema,
  coverUrl: z.string().nullable(),
  price: MoneySchema,
  billingPeriod: BillingPeriodSchema,
  isActive: z.boolean(),
  tags: z.array(z.string()),
});
export type Club = z.infer<typeof ClubSchema>;

export const ClubBriefSchema = ClubSchema.pick({
  id: true,
  title: true,
  category: true,
  coverUrl: true,
});
export type ClubBrief = z.infer<typeof ClubBriefSchema>;
