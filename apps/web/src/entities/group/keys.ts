import { queryKeys } from '@/shared/api/query-keys';

export const groupKeys = {
  list: () => [...queryKeys.teacher, 'groups'] as const,
  detail: (groupId: string) => [...queryKeys.teacher, 'groups', groupId] as const,
};
