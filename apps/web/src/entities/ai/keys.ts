import { queryKeys } from '@/shared/api/query-keys';

export const aiKeys = {
  conversations: () => [...queryKeys.ai, 'conversations'] as const,
  messages: (conversationId: string) =>
    [...queryKeys.ai, 'conversations', conversationId, 'messages'] as const,
  trajectory: () => [...queryKeys.student, 'trajectory'] as const,
};
