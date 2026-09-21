/**
 * Уведомления и их настройки. Владелец — B9.
 * docs/05-api-contracts.md §5.3 `notifications.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema, PaginationQuerySchema, paginated } from '../common';
import { NotificationSchema, NotificationSettingsSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const NotificationDtoSchema = NotificationSchema;
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

export const NotificationSettingsDtoSchema = NotificationSettingsSchema;
export type NotificationSettingsDto = z.infer<typeof NotificationSettingsDtoSchema>;

export const NotificationsPageSchema = paginated(NotificationDtoSchema).extend({
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationsPage = z.infer<typeof NotificationsPageSchema>;

export const UnreadCountSchema = z.object({ unreadCount: z.number().int().nonnegative() });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

// ---------- Query и тела запросов ----------

/** Булев query-параметр: в строке запроса приходит `true`/`false`. */
const BooleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const ListNotificationsQuerySchema = PaginationQuerySchema.extend({
  unreadOnly: BooleanQuerySchema.optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

/** Без ids — отметить прочитанными все. */
export const MarkNotificationsReadBodySchema = z.object({
  ids: z.array(IdSchema).optional(),
});
export type MarkNotificationsReadBody = z.infer<typeof MarkNotificationsReadBodySchema>;

export const UpdateNotificationSettingsBodySchema = NotificationSettingsDtoSchema;
export type UpdateNotificationSettingsBody = z.infer<typeof UpdateNotificationSettingsBodySchema>;

// ---------- Роуты ----------

export const notificationsContract = c.router(
  {
    listNotifications: {
      method: 'GET',
      path: '/notifications',
      query: ListNotificationsQuerySchema,
      responses: { 200: NotificationsPageSchema },
      summary: 'Уведомления пользователя со счётчиком непрочитанных',
      metadata: userRoute('common:notifications.view'),
    },
    markNotificationsRead: {
      method: 'POST',
      path: '/notifications/read',
      body: MarkNotificationsReadBodySchema,
      responses: { 200: UnreadCountSchema },
      summary: 'Отметить уведомления прочитанными',
      metadata: userRoute('common:notifications.view'),
    },
    getNotificationSettings: {
      method: 'GET',
      path: '/me/notification-settings',
      responses: { 200: NotificationSettingsDtoSchema },
      summary: 'Настройки уведомлений',
      metadata: userRoute('common:settings.edit'),
    },
    updateNotificationSettings: {
      method: 'PUT',
      path: '/me/notification-settings',
      body: UpdateNotificationSettingsBodySchema,
      responses: { 200: NotificationSettingsDtoSchema },
      summary: 'Изменить настройки уведомлений',
      metadata: userRoute('common:settings.edit'),
    },
  },
  contractRouterOptions,
);
