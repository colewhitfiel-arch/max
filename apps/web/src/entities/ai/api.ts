import type { CompleteOnboardingBody } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/auth/store';
import { aiKeys } from './keys';

/** `GET /ai/conversations?kind=TUTOR`. */
export function useConversations() {
  return useQuery({
    queryKey: aiKeys.conversations(),
    queryFn: () => call(api.ai.listConversations({ query: { kind: 'TUTOR' } })),
  });
}

/** `GET /ai/conversations/:id/messages`. */
export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: aiKeys.messages(conversationId),
    queryFn: () => call(api.ai.listConversationMessages({ params: { conversationId }, query: {} })),
  });
}

/** `POST /ai/conversations { kind: 'TUTOR' }`. */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.ai.createConversation({ body: { kind: 'TUTOR' } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.conversations() }),
  });
}

/** `DELETE /ai/conversations/:id`. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      call(api.ai.deleteConversation({ params: { conversationId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai }),
  });
}

/** `GET /parent/children/:studentId/ai/conversations` — диалоги родителя с тьютором о ребёнке. */
export function useParentConversations(studentId: string | null) {
  return useQuery({
    queryKey: aiKeys.parentConversations(studentId ?? ''),
    queryFn: () =>
      call(api.ai.listParentConversations({ params: { studentId: studentId! }, query: {} })),
    enabled: !!studentId,
  });
}

/** `POST /parent/children/:studentId/ai/conversations` — новый диалог о ребёнке (переменная — studentId). */
export function useCreateParentConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      call(api.ai.createParentConversation({ params: { studentId } })),
    onSuccess: (_conversation, studentId) =>
      queryClient.invalidateQueries({ queryKey: aiKeys.parentConversations(studentId) }),
  });
}

/** `GET /parent/ai/conversations/:id/messages`. */
export function useParentMessages(conversationId: string) {
  return useQuery({
    queryKey: aiKeys.parentMessages(conversationId),
    queryFn: () =>
      call(api.ai.listParentConversationMessages({ params: { conversationId }, query: {} })),
  });
}

/** Как часто перезапрашивать траекторию, пока пересчёт стоит в очереди (F5). */
const TRAJECTORY_POLL_MS = 5_000;

/**
 * `GET /student/trajectory` (null — ещё не построена). `queuedAt` — момент постановки пересчёта
 * в очередь: пока версия старше (или траектории нет), перезапрашиваем раз в
 * `TRAJECTORY_POLL_MS`; сколько ждать — решает потребитель (сбрасывает `queuedAt`).
 */
export function useTrajectory({ queuedAt = null }: { queuedAt?: number | null } = {}) {
  return useQuery({
    queryKey: aiKeys.trajectory(),
    queryFn: () => call(api.ai.getTrajectory()),
    refetchInterval: (query) => {
      if (queuedAt == null) return false;
      const data = query.state.data;
      const fresh = data != null && new Date(data.generatedAt).getTime() >= queuedAt;
      return fresh ? false : TRAJECTORY_POLL_MS;
    },
  });
}

/**
 * `POST /student/trajectory/refresh` → 202. Пересчёт идёт в worker'е: результат подтягивает
 * опрос `useTrajectory({ poll: true })` у потребителя (без таймеров, переживающих экран).
 */
export function useRefreshTrajectory() {
  return useMutation({ mutationFn: () => call(api.ai.refreshTrajectory()) });
}

/** `POST /student/onboarding/complete` → MeDto (onboardingCompleted = true). */
export function useCompleteOnboarding() {
  const updateMe = useAuthStore((s) => s.updateMe);
  return useMutation({
    mutationFn: (body: CompleteOnboardingBody) => call(api.ai.completeOnboarding({ body })),
    onSuccess: (me) => updateMe(me),
  });
}

/** `POST /student/onboarding/start` → диалог и первый вопрос ИИ (F1). */
export function useStartOnboarding() {
  return useMutation({ mutationFn: () => call(api.ai.startOnboarding()) });
}

/** `GET /student/onboarding/recommendations` — после `done.isComplete`. */
export function useOnboardingRecommendations(enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.recommendations(),
    queryFn: () => call(api.ai.getOnboardingRecommendations()),
    enabled,
  });
}

/** `GET /teacher/clubs/demand` — спрос на кружки школы по итогам онбордингов. */
export function useClubDemand() {
  return useQuery({
    queryKey: aiKeys.clubDemand(),
    queryFn: () => call(api.ai.getClubDemand()),
  });
}
