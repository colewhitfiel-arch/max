import type { ListNotificationsQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const notificationKeys = {
  list: (query: Partial<ListNotificationsQuery>) =>
    [...queryKeys.notifications, 'list', query] as const,
  settings: () => [...queryKeys.notifications, 'settings'] as const,
};
