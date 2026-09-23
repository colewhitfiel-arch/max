import type { NotificationSettings, NotificationsPage } from '@edu/contracts';
import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { notificationKeys } from './keys';

export interface NotificationsFilter {
  unreadOnly?: boolean;
}

// Контракт ждёт строку 'true' | 'false' (query-параметр).
const listQuery = (filter: NotificationsFilter, cursor?: string) => ({
  ...(filter.unreadOnly ? { unreadOnly: 'true' as const } : {}),
  ...(cursor ? { cursor } : {}),
});

/** `GET /notifications?unreadOnly` — первая страница (бейджи, счётчик, короткие списки). */
export function useNotifications(filter: NotificationsFilter = {}) {
  return useQuery({
    queryKey: notificationKeys.list(filter),
    queryFn: () => call(api.notifications.listNotifications({ query: listQuery(filter) })),
  });
}

/** `GET /notifications?unreadOnly&cursor` постранично — полный список с подгрузкой «Ещё». */
export function useNotificationsInfinite(filter: NotificationsFilter = {}) {
  return useInfiniteQuery({
    queryKey: notificationKeys.infinite(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(api.notifications.listNotifications({ query: listQuery(filter, pageParam) })),
    getNextPageParam: (page) => page.nextCursor,
  });
}

type NotificationsCache = NotificationsPage | InfiniteData<NotificationsPage> | undefined;

function isNotificationsCache(
  data: unknown,
): data is NotificationsPage | InfiniteData<NotificationsPage> {
  return typeof data === 'object' && data !== null && ('items' in data || 'pages' in data);
}

/** Оптимистично отметить прочитанными `ids` (или все) в одной странице. */
function markPage(page: NotificationsPage, ids: string[] | undefined, readAt: string) {
  let marked = 0;
  const items = page.items.map((n) => {
    if (n.readAt || (ids && !ids.includes(n.id))) return n;
    marked += 1;
    return { ...n, readAt };
  });
  // Счётчик — серверный (учитывает и непрочитанные за пределами страницы).
  const unreadCount = ids ? Math.max(0, page.unreadCount - marked) : 0;
  return { page: { ...page, items, unreadCount }, marked };
}

/** `POST /notifications/read` (ids или все) с оптимистичным обновлением списков и откатом. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      call(api.notifications.markNotificationsRead({ body: ids ? { ids } : {} })),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      // Снимок только списков (под тем же префиксом лежат и настройки уведомлений).
      const previous = queryClient
        .getQueriesData<NotificationsCache>({ queryKey: queryKeys.notifications })
        .filter(([, data]) => isNotificationsCache(data));
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<NotificationsCache>(
        { queryKey: queryKeys.notifications },
        (data) => {
          if (!isNotificationsCache(data)) return data;
          if ('items' in data) return markPage(data, ids, readAt).page;
          // Все страницы — одна выборка: общий unreadCount уменьшается на всё отмеченное.
          let marked = 0;
          const pages = data.pages.map((page) => {
            const result = markPage(page, ids, readAt);
            marked += result.marked;
            return result.page;
          });
          const unreadCount = ids ? Math.max(0, (data.pages[0]?.unreadCount ?? 0) - marked) : 0;
          return { ...data, pages: pages.map((page) => ({ ...page, unreadCount })) };
        },
      );
      return { previous };
    },
    onError: (_error, _ids, context) => {
      context?.previous.forEach(([key, data]: [QueryKey, NotificationsCache]) =>
        queryClient.setQueryData(key, data),
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
