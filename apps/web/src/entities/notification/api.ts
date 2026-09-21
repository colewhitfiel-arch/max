import type { NotificationSettings, NotificationsPage } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { notificationKeys } from './keys';

export interface NotificationsFilter {
  unreadOnly?: boolean;
}

/** `GET /notifications?unreadOnly`. */
export function useNotifications(filter: NotificationsFilter = {}) {
  return useQuery({
    queryKey: notificationKeys.list(filter),
    queryFn: () =>
      call(
        api.notifications.listNotifications({
          // Контракт ждёт строку 'true' | 'false' (query-параметр).
          query: filter.unreadOnly ? { unreadOnly: 'true' } : {},
        }),
      ),
  });
}

/** `POST /notifications/read` (ids или все) с оптимистичным обновлением списков. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      call(api.notifications.markNotificationsRead({ body: ids ? { ids } : {} })),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<NotificationsPage>(
        { queryKey: queryKeys.notifications },
        (page) => {
          if (!page || !('items' in page)) return page;
          const items = page.items.map((n) =>
            n.readAt || (ids && !ids.includes(n.id)) ? n : { ...n, readAt },
          );
          return { ...page, items, unreadCount: items.filter((n) => !n.readAt).length };
        },
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

/** `GET /me/notification-settings`. */
export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationKeys.settings(),
    queryFn: () => call(api.notifications.getNotificationSettings()),
  });
}

/** `PUT /me/notification-settings` с оптимистичным переключением и откатом при ошибке. */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationSettings) =>
      call(api.notifications.updateNotificationSettings({ body })),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.settings() });
      const previous = queryClient.getQueryData<NotificationSettings>(notificationKeys.settings());
      queryClient.setQueryData(notificationKeys.settings(), next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous)
        queryClient.setQueryData(notificationKeys.settings(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.settings() }),
  });
}
