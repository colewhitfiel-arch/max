import { z } from 'zod';
import { PaymentStatusSchema } from '../enums';
import { DateOnlySchema, DateTimeSchema, IdSchema, MoneySchema } from '../common/primitives';
import { ClubBriefSchema } from './club';
import { StudentBriefSchema } from './profiles';

export const PaymentSchema = z.object({
  id: IdSchema,
  parentId: IdSchema,
  studentId: IdSchema,
  enrollmentId: IdSchema,
  amount: MoneySchema,
  status: PaymentStatusSchema,
  provider: z.string(),
  periodsCount: z.number().int().positive(),
  confirmationUrl: z.string().nullable(),
  createdAt: DateTimeSchema,
  paidAt: DateTimeSchema.nullable(),
  failReason: z.string().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const PaymentDtoSchema = PaymentSchema.extend({
  club: ClubBriefSchema,
  student: StudentBriefSchema,
});
export type PaymentDto = z.infer<typeof PaymentDtoSchema>;

export const PaidPeriodSchema = z.object({
  id: IdSchema,
  enrollmentId: IdSchema,
  periodStart: DateOnlySchema,
  periodEnd: DateOnlySchema,
  paymentId: IdSchema,
});
export type PaidPeriod = z.infer<typeof PaidPeriodSchema>;
