import { queryKeys } from '@/shared/api/query-keys';

export const aiKeys = {
  conversations: () => [...queryKeys.ai, 'conversations'] as const,
  messages: (conversationId: string) =>
    [...queryKeys.ai, 'conversations', conversationId, 'messages'] as const,
  trajectory: () => [...queryKeys.student, 'trajectory'] as const,
  recommendations: () => [...queryKeys.student, 'onboarding', 'recommendations'] as const,
  clubDemand: () => [...queryKeys.ai, 'club-demand'] as const,
  /** Диалоги родителя о ребёнке — под префиксом ребёнка, чтобы отвязка чистила кэш. */
  parentConversations: (studentId: string) =>
    [...queryKeys.parent(studentId), 'ai', 'conversations'] as const,
  parentMessages: (conversationId: string) =>
    [...queryKeys.parentRoot, 'ai', 'conversations', conversationId, 'messages'] as const,
};
