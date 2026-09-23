import type { ListNotificationsQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const notificationKeys = {
  list: (query: Partial<ListNotificationsQuery>) =>
    [...queryKeys.notifications, 'list', query] as const,
  /** Постраничный список: префикс `list(query)` — инвалидация списка задевает и его. */
  infinite: (query: Partial<ListNotificationsQuery>) =>
    [...queryKeys.notifications, 'list', query, 'infinite'] as const,
  settings: () => [...queryKeys.notifications, 'settings'] as const,
};
