import type { NotificationsPage } from '@edu/contracts';
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
