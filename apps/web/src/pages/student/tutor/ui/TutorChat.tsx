import { type AiMessageDto, STREAMING_ROUTES } from '@edu/contracts';
import { Button, ChatComposer, Screen, Stack, Text, VisuallyHidden } from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aiKeys,
  ChatMessage,
  ChatMessageList,
  messagesQueryOptions,
  TutorAvatar,
  useChatFeedScroll,
  useCreateConversation,
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
  /** Открытый диалог; `null` — новый чат: диалог создаётся на сервере первой отправкой. */
  conversationId: string | null;
  /** Идёт ли стрим — для подписи в шапке экрана. */
  onStreamingChange?: (streaming: boolean) => void;
  /** Первая отправка создала диалог — страница переводит адрес на него (`/student/tutor/:id`). */
  onConversationCreated?: (conversationId: string) => void;
}

/**
 * Лента одного диалога с тьютором: пузыри, стрим ответа через SSE (индикатор набора, «Стоп»),
 * поле ввода прижато к низу. Новый чат (`conversationId: null`) создаётся при первой отправке,
 * как в ChatGPT: пустые диалоги на сервере не копятся. Новые сообщения появляются плавно.
 */
export function TutorChat({
  conversationId,
  onStreamingChange,
  onConversationCreated,
}: TutorChatProps) {
  const { t } = useTranslation('student');
  const queryClient = useQueryClient();
  const create = useCreateConversation();
  // Диалог, созданный первой отправкой этого чата: пока идёт первый ответ, ленту с сервера не
  // берём — вопрос и стрим рисуются локально (иначе вопрос пришёл бы дважды).
  const [freshId, setFreshId] = useState<string | null>(null);
  const activeId = conversationId ?? freshId;
  const fromServer = activeId !== null && activeId !== freshId;
  const query = useMessages(activeId ?? '', { enabled: fromServer });
  const stream = useAiStream();
  const [draft, setDraft] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [createError, setCreateError] = useState<unknown>(null);
  // Готовый ответ озвучивается один раз (лента не live-регион: иначе скринридер зачитывает
  // каждый токен стрима и смену скелета на историю).
  const [announcement, setAnnouncement] = useState('');
  // Номер отправки: ответ на старый вопрос, пришедший после нового, не трогает его состояние.
  const sendIdRef = useRef(0);
  const items: AiMessageDto[] = fromServer ? (query.data?.items ?? []) : [];
  const { bottomRef, loadOlder } = useChatFeedScroll({
    items,
    pendingText: pendingUserText,
    streamText: stream.text,
  });

  useEffect(() => onStreamingChange?.(stream.isStreaming), [stream.isStreaming, onStreamingChange]);

  /**
   * Лента после ответа: перезапрос открытой; у только что созданной — загрузка в кэш, чтобы
   * переключение на серверную ленту (`setFreshId(null)`) не мигало скелетом.
   */
  const refreshFeed = useCallback(
    async (id: string, fresh: boolean) => {
      await queryClient.invalidateQueries({ queryKey: aiKeys.messages(id) });
      if (fresh) await queryClient.prefetchInfiniteQuery(messagesQueryOptions(id));
    },
    [queryClient],
  );

  const send = useCallback(
    async (text: string) => {
      const sendId = ++sendIdRef.current;
      setPendingUserText(text);
      setAnnouncement('');
      setCreateError(null);
      let id = activeId;
      const fresh = id === null;
      if (id === null) {
        try {
          id = (await create.mutateAsync()).id;
        } catch (error) {
          // Диалог не создался — вопрос возвращаем в поле, ошибку показываем под лентой.
          setPendingUserText(null);
          setCreateError(error);
          setDraft((current) => current || text);
          return;
        }
        setFreshId(id);
        onConversationCreated?.(id);
      }
      const result = await stream.start(STREAMING_ROUTES.tutorMessage.path(id), { text });
      if (result.status === 'done') {
        // «Стоп» (done без messageId): стрим сбрасываем сразу, до перезапроса ленты, — запоздалый
        // reset() не оборвёт вопрос, отправленный, пока лента грузится. Пустой ответ не рисуем.
        const stopped = result.messageId === null;
        if (stopped) stream.reset();
        await refreshFeed(id, fresh);
        // Лента нового чата загружена — дальше она с сервера, даже если, пока она грузилась,
        // ученик уже отправил следующий вопрос: иначе лента осталась бы локальной и пустой.
        if (fresh) setFreshId(null);
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
        await refreshFeed(id, fresh);
        if (fresh) setFreshId(null);
      }
      // История: заголовок нового чата и порядок по последнему сообщению.
      void queryClient.invalidateQueries({ queryKey: aiKeys.conversations(), exact: true });
    },
    [activeId, create, onConversationCreated, queryClient, refreshFeed, stream],
  );

  const messageCount = items.length;

  // Ошибка первой отправки тоже не «пустой чат»: иначе alert с ошибкой пропадёт вместе с лентой.
  const isEmpty =
    messageCount === 0 &&
    !pendingUserText &&
    !stream.text &&
    stream.status !== 'error' &&
    createError === null;

  const feed = isEmpty ? (
    <EmptyChat />
  ) : (
    <>
      {fromServer && query.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          loading={query.isFetchingNextPage}
          onClick={() => void loadOlder(query.fetchNextPage)}
        >
          {t('common:chat.loadOlder')}
        </Button>
      )}
      <ChatMessageList items={items} />
      {pendingUserText && <ChatMessage role="USER" content={pendingUserText} appear />}
      {(stream.isStreaming || stream.text) && (
        <ChatMessage role="ASSISTANT" content={stream.text} streaming={stream.isStreaming} appear />
      )}
      {stream.status === 'error' && stream.error && (
        <Text variant="small" tone="danger" align="center" role="alert">
          {describeApiError(stream.error)}
        </Text>
      )}
      {createError !== null && (
        <Text variant="small" tone="danger" align="center" role="alert">
          {describeApiError(createError)}
        </Text>
      )}
    </>
  );

  return (
    <Screen fill>
      <Stack gap={3} grow justify="end">
        {fromServer ? <AsyncState query={query}>{() => feed}</AsyncState> : feed}
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
        busy={stream.isStreaming || create.isPending}
        onStop={stream.abort}
        placeholder={t('tutor.placeholder')}
        inputLabel={t('common:chat.inputLabel')}
        sendLabel={t('tutor.send')}
        stopLabel={t('tutor.stop')}
      />
    </Screen>
  );
}
