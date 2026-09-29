import { STREAMING_ROUTES } from '@edu/contracts';
import { Button, ChatComposer, Screen, Stack, Text } from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aiKeys,
  ChatMessage,
  ChatMessageList,
  TutorAvatar,
  useChatFeedScroll,
  useParentMessages,
} from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { useMe } from '@/shared/auth/hooks';
import { AsyncState } from '@/shared/ui';

/** Пустой чат: маскот и приветствие родителя. Вопрос родитель формулирует сам. */
function EmptyChat({ childName }: { childName: string }) {
  const { t } = useTranslation('parent-tutor');
  const name = useMe()?.user.firstName.trim();
  return (
    <Stack gap={5} align="center" grow justify="center">
      <Stack gap={3} align="center">
        <TutorAvatar size="xl" />
        <Stack gap={1} align="center">
          <Text variant="title" align="center">
            {name ? t('greeting', { name }) : t('greetingAnon')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t('intro', { name: childName })}
          </Text>
        </Stack>
      </Stack>
    </Stack>
  );
}

export interface ParentTutorChatProps {
  conversationId: string;
  /** Имя ребёнка для приветствия. */
  childName: string;
  /** Идёт ли стрим — для подписи в шапке экрана. */
  onStreamingChange?: (streaming: boolean) => void;
}

/**
 * Лента диалога родителя с тьютором о ребёнке — как у ученика (F4): пузыри, стрим ответа через
 * SSE (`STREAMING_ROUTES.parentTutorMessage`, индикатор набора, «Стоп»), поле ввода прижато к низу.
 */
export function ParentTutorChat({
  conversationId,
  childName,
  onStreamingChange,
}: ParentTutorChatProps) {
  const { t } = useTranslation('parent-tutor');
  const queryClient = useQueryClient();
  const query = useParentMessages(conversationId);
  const stream = useAiStream();
  const [draft, setDraft] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  // Номер отправки: ответ на старый вопрос, пришедший после нового, не трогает его состояние.
  const sendIdRef = useRef(0);
  const { bottomRef, loadOlder } = useChatFeedScroll({
    items: query.data?.items,
    pendingText: pendingUserText,
    streamText: stream.text,
  });

  useEffect(() => onStreamingChange?.(stream.isStreaming), [stream.isStreaming, onStreamingChange]);
  // Смена ребёнка размонтирует ленту посреди стрима — шапка не должна остаться в «печатает…».
  useEffect(() => () => onStreamingChange?.(false), [onStreamingChange]);

  const send = useCallback(
    async (text: string) => {
      const sendId = ++sendIdRef.current;
      setPendingUserText(text);
      const result = await stream.start(STREAMING_ROUTES.parentTutorMessage.path(conversationId), {
        text,
      });
      if (result.status === 'done') {
        // «Стоп» (done без messageId): стрим сбрасываем сразу, до перезапроса ленты, — запоздалый
        // reset() не оборвёт вопрос, отправленный, пока лента грузится. Пустой ответ не рисуем.
        const stopped = result.messageId === null;
        if (stopped) stream.reset();
        await queryClient.invalidateQueries({ queryKey: aiKeys.parentMessages(conversationId) });
        if (sendIdRef.current !== sendId) return;
        setPendingUserText(null);
        if (!stopped) stream.reset();
      } else if (result.status === 'error') {
        // Ошибка (лимит, сеть, сбой потока): «отправленный» пузырь убираем, ленту перезапрашиваем —
        // если сервер успел сохранить вопрос, он придёт с историей. Ответ не начался — вопрос
        // возвращаем в поле (если пользователь ничего не набрал), чтобы отправить повторно.
        // Ошибку не сбрасываем: alert живёт до следующей отправки.
        setPendingUserText(null);
        if (!result.text) setDraft((current) => current || text);
        await queryClient.invalidateQueries({ queryKey: aiKeys.parentMessages(conversationId) });
      }
    },
    [conversationId, queryClient, stream],
  );

  const messageCount = query.data?.items.length ?? 0;
  // Ошибка первой отправки тоже не «пустой чат»: иначе alert с ошибкой пропадёт вместе с лентой.
  const isEmpty =
    messageCount === 0 && !pendingUserText && !stream.text && stream.status !== 'error';

  return (
    <Screen grow data-tour="chat">
      <Stack gap={3} grow justify="end" aria-live="polite">
        <AsyncState query={query}>
          {(page) =>
            isEmpty ? (
              <EmptyChat childName={childName} />
            ) : (
              <>
                {query.hasNextPage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={query.isFetchingNextPage}
                    onClick={() => void loadOlder(query.fetchNextPage)}
                  >
                    {t('common:chat.loadOlder')}
                  </Button>
                )}
                <ChatMessageList items={page.items} ownLabel={t('you')} />
                {pendingUserText && (
                  <ChatMessage role="USER" content={pendingUserText} ownLabel={t('you')} />
                )}
                {(stream.isStreaming || stream.text) && (
                  <ChatMessage
                    role="ASSISTANT"
                    content={stream.text}
                    streaming={stream.isStreaming}
                  />
                )}
                {stream.status === 'error' && stream.error && (
                  <Text variant="small" tone="danger" align="center" role="alert">
                    {describeApiError(stream.error)}
                  </Text>
                )}
              </>
            )
          }
        </AsyncState>
        <div ref={bottomRef} aria-hidden="true" />
      </Stack>

      <ChatComposer
        sticky
        value={draft}
        onChange={setDraft}
        onSubmit={(text) => {
          setDraft('');
          void send(text);
        }}
        busy={stream.isStreaming}
        onStop={stream.abort}
        placeholder={t('placeholder')}
        inputLabel={t('common:chat.inputLabel')}
        sendLabel={t('send')}
        stopLabel={t('stop')}
      />
    </Screen>
  );
}
