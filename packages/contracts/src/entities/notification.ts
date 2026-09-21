import { z } from 'zod';
import { NotificationTypeSchema, TicketStatusSchema } from '../enums';
import { DateTimeSchema, IdSchema } from '../common/primitives';

export const NotificationPayloadSchema = z.object({
  entityType: z.string().optional(),
  entityId: IdSchema.optional(),
  /** Маршрут во фронте, куда ведёт уведомление, например `/student/assignments/:id` */
  route: z.string().optional(),
});

export const NotificationSchema = z.object({
  id: IdSchema,
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  payload: NotificationPayloadSchema.nullable(),
  readAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationSettingsSchema = z.object({
  lessons: z.boolean(),
  assignments: z.boolean(),
  grades: z.boolean(),
  attendance: z.boolean(),
  insights: z.boolean(),
  payments: z.boolean(),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const SupportTicketSchema = z.object({
  id: IdSchema,
  subject: z.string(),
  message: z.string(),
  status: TicketStatusSchema,
  createdAt: DateTimeSchema,
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;
