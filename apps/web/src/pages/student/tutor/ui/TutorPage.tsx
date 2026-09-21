import type { ConversationDto } from '@edu/contracts';
import { Screen, Skeleton, Stack } from '@edu/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversations, useCreateConversation } from '@/entities/ai';
import { QueryError, ScreenHeader } from '@/shared/ui';
import { TutorChat } from './TutorChat';

/** Самый свежий диалог по времени последнего сообщения (без сообщений — по порядку сервера). */
function latestConversation(items: ConversationDto[]): ConversationDto | undefined {
  return [...items].sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))[0];
}

/** Скелет чата: пара пузырей с обеих сторон и поле ввода. */
function ChatSkeleton() {
  return (
    <Screen fill>
      <Stack gap={3} grow justify="end" aria-busy="true">
        <Skeleton height={56} width="70%" />
        <Stack align="end">
          <Skeleton height={40} width="55%" />
        </Stack>
        <Skeleton height={72} width="80%" />
        <Skeleton height={52} />
      </Stack>
    </Screen>
  );
}

/**
 * `/student/tutor` — один непрерывный чат с тьютором (F4), без списка диалогов:
 * берём самый свежий диалог, а если его нет — создаём и сразу открываем ленту.
 */
export function TutorPage() {
  const { t } = useTranslation('student');
  const conversations = useConversations();
  const create = useCreateConversation();
  const [streaming, setStreaming] = useState(false);
  // Guard от повторного создания (StrictMode вызывает эффекты дважды).
  const createdRef = useRef(false);

  const latest = conversations.data ? latestConversation(conversations.data.items) : undefined;
  const conversationId = latest?.id ?? create.data?.id;

  useEffect(() => {
    if (!conversations.isSuccess || latest || createdRef.current) return;
    createdRef.current = true;
    create.mutate();
  }, [conversations.isSuccess, latest, create]);

  return (
    <>
      <ScreenHeader
        title={t('tutor.title')}
        subtitle={streaming ? t('tutor.typing') : t('tutor.online')}
        bell
        sticky
      />
      {conversations.isError ? (
        <Screen>
          <QueryError error={conversations.error} onRetry={() => void conversations.refetch()} />
        </Screen>
      ) : create.isError ? (
        <Screen>
          <QueryError error={create.error} onRetry={() => create.mutate()} />
        </Screen>
      ) : conversationId ? (
        <TutorChat conversationId={conversationId} onStreamingChange={setStreaming} />
      ) : (
        <ChatSkeleton />
      )}
    </>
  );
}
