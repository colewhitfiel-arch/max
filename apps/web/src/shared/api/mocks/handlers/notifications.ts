/** Уведомления и их настройки. */
import {
  MarkNotificationsReadBodySchema,
  NotificationSettingsDtoSchema,
  NotificationsPageSchema,
  UnreadCountSchema,
  UpdateNotificationSettingsBodySchema,
  type NotificationSettings,
} from '@edu/contracts';
import { http } from 'msw';
import { apiUrl, authed, json, paginate, query, readBody } from '../lib';
import { db } from '../state';

const defaultSettings: NotificationSettings = {
  lessons: true,
  assignments: true,
  grades: true,
  attendance: true,
  insights: true,
  payments: true,
};

const mine = (userId: string) =>
  db.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const notificationsHandlers = [
  http.get(
    apiUrl('/notifications'),
    authed(({ auth, request }) => {
      const unreadOnly = query(request).get('unreadOnly') === 'true';
      const all = mine(auth.user.id);
      // Страница по `?limit&cursor` (новые сверху), счётчик — по всей выборке пользователя.
      const result = paginate(request, unreadOnly ? all.filter((n) => !n.readAt) : all);
      if (!result.ok) return result.response;
      return json(NotificationsPageSchema, {
        ...result.page,
        items: result.page.items.map(({ userId: _u, ...n }) => n),
        unreadCount: all.filter((n) => !n.readAt).length,
      });
    }),
  ),

  http.post(
    apiUrl('/notifications/read'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, MarkNotificationsReadBodySchema);
      if (!body.ok) return body.response;
      const now = new Date().toISOString();
      for (const n of mine(auth.user.id)) {
        if (!n.readAt && (!body.data.ids || body.data.ids.includes(n.id))) n.readAt = now;
      }
      return json(UnreadCountSchema, {
        unreadCount: mine(auth.user.id).filter((n) => !n.readAt).length,
      });
    }),
  ),

  http.get(
    apiUrl('/me/notification-settings'),
    authed(({ auth }) =>
      json(
        NotificationSettingsDtoSchema,
        db.notificationSettings.get(auth.user.id) ?? defaultSettings,
      ),
    ),
  ),

  http.put(
    apiUrl('/me/notification-settings'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, UpdateNotificationSettingsBodySchema);
      if (!body.ok) return body.response;
      db.notificationSettings.set(auth.user.id, body.data);
      return json(NotificationSettingsDtoSchema, body.data);
    }),
  ),
];
