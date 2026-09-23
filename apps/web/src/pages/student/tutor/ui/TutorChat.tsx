import { STREAMING_ROUTES } from '@edu/contracts';
import { Button, ChatComposer, Screen, Stack, Text, VisuallyHidden } from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aiKeys,
  ChatMessage,
  ChatMessageList,
  TutorAvatar,
  useChatFeedScroll,
  useMessages,
} from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { useMe } from '@/shared/auth/hooks';
import { AsyncState } from '@/shared/ui';

/** Пустой чат: маскот и приветствие. Вопрос ученик формулирует сам — готовых подсказок нет. */
function EmptyChat() {
  const { t } = useTranslation('student');
  const name = useMe()?.user.firstName.trim();
  return (
    <Stack gap={5} align="center" grow justify="center">
      <Stack gap={3} align="center">
        <TutorAvatar size="xl" />
        <Stack gap={1} align="center">
          <Text variant="title" align="center">
            {name ? t('tutor.greeting', { name }) : t('tutor.greetingAnon')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t('tutor.intro')}
          </Text>
        </Stack>
      </Stack>
    </Stack>
  );
}

export interface TutorChatProps {
  conversationId: string;
  /** Идёт ли стрим — для подписи в шапке экрана. */
  onStreamingChange?: (streaming: boolean) => void;
}

/**
 * Лента одного диалога с тьютором: пузыри, стрим ответа через SSE (индикатор набора, «Стоп»),
 * поле ввода прижато к низу. Историю диалогов не показываем — это один непрерывный чат.
 */
export function TutorChat({ conversationId, onStreamingChange }: TutorChatProps) {
  const { t } = useTranslation('student');
  const queryClient = useQueryClient();
  const query = useMessages(conversationId);
  const stream = useAiStream();
  const [draft, setDraft] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  // Готовый ответ озвучивается один раз (лента не live-регион: иначе скринридер зачитывает
  // каждый токен стрима и смену скелета на историю).
  const [announcement, setAnnouncement] = useState('');
  // Номер отправки: ответ на старый вопрос, пришедший после нового, не трогает его состояние.
  const sendIdRef = useRef(0);
  const { bottomRef, loadOlder } = useChatFeedScroll({
    items: query.data?.items,
    pendingText: pendingUserText,
    streamText: stream.text,
  });

  useEffect(() => onStreamingChange?.(stream.isStreaming), [stream.isStreaming, onStreamingChange]);

  const send = useCallback(
    async (text: string) => {
      const sendId = ++sendIdRef.current;
      setPendingUserText(text);
      setAnnouncement('');
      const result = await stream.start(STREAMING_ROUTES.tutorMessage.path(conversationId), {
        text,
      });
      if (result.status === 'done') {
        // «Стоп» (done без messageId): стрим сбрасываем сразу, до перезапроса ленты, — запоздалый
        // reset() не оборвёт вопрос, отправленный, пока лента грузится. Пустой ответ не рисуем.
        const stopped = result.messageId === null;
        if (stopped) stream.reset();
        await queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
        if (sendIdRef.current !== sendId) return;
        setPendingUserText(null);
        if (!stopped) {
          setAnnouncement(result.text);
          stream.reset();
        }
      } else if (result.status === 'error') {
        // Ошибка (лимит, сеть, сбой потока): «отправленный» пузырь убираем, ленту перезапрашиваем —
        // если сервер успел сохранить вопрос, он придёт с историей. Ответ не начался — вопрос
        // возвращаем в поле (если пользователь ничего не набрал), чтобы отправить повторно.
        // Ошибку не сбрасываем: alert живёт до следующей отправки.
        setPendingUserText(null);
        if (!result.text) setDraft((current) => current || text);
        await queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
      }
    },
    [conversationId, queryClient, stream],
  );

  const messageCount = query.data?.items.length ?? 0;

  // Ошибка первой отправки тоже не «пустой чат»: иначе alert с ошибкой пропадёт вместе с лентой.
  const isEmpty =
    messageCount === 0 && !pendingUserText && !stream.text && stream.status !== 'error';

  return (
    <Screen fill>
      <Stack gap={3} grow justify="end">
        <AsyncState query={query}>
          {(page) =>
            isEmpty ? (
              <EmptyChat />
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
                <ChatMessageList items={page.items} />
                {pendingUserText && <ChatMessage role="USER" content={pendingUserText} />}
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
        <VisuallyHidden role="status">{announcement}</VisuallyHidden>
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
        placeholder={t('tutor.placeholder')}
        inputLabel={t('common:chat.inputLabel')}
        sendLabel={t('tutor.send')}
        stopLabel={t('tutor.stop')}
      />
    </Screen>
  );
}
