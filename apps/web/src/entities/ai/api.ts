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

/** `GET /student/trajectory` (null — ещё не построена). */
export function useTrajectory() {
  return useQuery({
    queryKey: aiKeys.trajectory(),
    queryFn: () => call(api.ai.getTrajectory()),
  });
}

/** `POST /student/trajectory/refresh` → 202. */
export function useRefreshTrajectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.ai.refreshTrajectory()),
    onSuccess: () => {
      // Worker пересчитает; перезапросим через 10 с (F5).
      setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: aiKeys.trajectory() }),
        10_000,
      );
    },
  });
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
