import type {
  AiMessageDto,
  CompleteOnboardingBody,
  ConversationDto,
  Paginated,
} from '@edu/contracts';
import {
  type InfiniteData,
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { useAuthStore } from '@/shared/auth/store';
import { aiKeys } from './keys';

/**
 * История чатов с тьютором: `GET /ai/conversations?kind=TUTOR`, свежие сверху (по последнему
 * сообщению), `fetchNextPage()` подгружает более старые. Чаты без сообщений (созданы, но вопрос
 * так и не отправлен) в историю не попадают.
 */
export function useConversationHistory() {
  return useInfiniteQuery({
    queryKey: aiKeys.conversations(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(api.ai.listConversations({ query: { kind: 'TUTOR', ...cursorQuery(pageParam) } })),
    getNextPageParam: (page) => page.nextCursor,
    select: (data): ConversationDto[] =>
      data.pages.flatMap((page) => page.items).filter((item) => item.lastMessageAt !== null),
  });
}

/** Лента чата одним списком: страницы идут от новых к старым, внутри — по возрастанию времени. */
export interface ChatFeed {
  items: AiMessageDto[];
}

const chatFeed = (data: InfiniteData<Paginated<AiMessageDto>>): ChatFeed => ({
  items: [...data.pages].reverse().flatMap((page) => page.items),
});

function cursorQuery(cursor: string | undefined) {
  return cursor ? { cursor } : {};
}

/**
 * Запрос ленты диалога (без `select`): общий для `useMessages` и предзагрузки
 * (`queryClient.prefetchInfiniteQuery(messagesQueryOptions(id))`) — новый чат грузит ленту
 * заранее, до того как начнёт показывать её с сервера.
 */
export function messagesQueryOptions(conversationId: string) {
  return infiniteQueryOptions({
    queryKey: aiKeys.messages(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api.ai.listConversationMessages({
          params: { conversationId },
          query: cursorQuery(pageParam),
        }),
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
}

/**
 * `GET /ai/conversations/:id/messages` — лента с конца: первая страница — последние сообщения,
 * `fetchNextPage()` подгружает более старые (они встают в начало `data.items`). Инвалидация
 * после ответа перезапрашивает загруженные страницы — новое сообщение появляется в конце.
 * `enabled: false` — ленту пока не запрашивать (новый чат ещё ждёт первый ответ).
 */
export function useMessages(
  conversationId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    ...messagesQueryOptions(conversationId),
    select: chatFeed,
    enabled,
  });
}

/**
 * `POST /ai/conversations { kind: 'TUTOR' }`. Перезапрашивается только история (`exact`):
 * ключи лент лежат под тем же префиксом, их трогать незачем.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.ai.createConversation({ body: { kind: 'TUTOR' } })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: aiKeys.conversations(), exact: true }),
  });
}

/** `DELETE /ai/conversations/:id`: история перезапрашивается, лента удалённого чата — из кэша. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      call(api.ai.deleteConversation({ params: { conversationId } })),
    onSuccess: (_result, conversationId) => {
      queryClient.removeQueries({ queryKey: aiKeys.messages(conversationId) });
      return queryClient.invalidateQueries({ queryKey: aiKeys.conversations(), exact: true });
    },
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

/** `GET /parent/ai/conversations/:id/messages` — лента с конца, как `useMessages`. */
export function useParentMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: aiKeys.parentMessages(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api.ai.listParentConversationMessages({
          params: { conversationId },
          query: cursorQuery(pageParam),
        }),
      ),
    getNextPageParam: (page) => page.nextCursor,
    select: chatFeed,
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
