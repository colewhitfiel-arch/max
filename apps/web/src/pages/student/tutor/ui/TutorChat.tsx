import { STREAMING_ROUTES } from '@edu/contracts';
import { ChatComposer, Chip, Inline, Screen, Stack, Text, VisuallyHidden } from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aiKeys, ChatMessage, ChatMessageList, TutorAvatar, useMessages } from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { useMe } from '@/shared/auth/hooks';
import { AsyncState } from '@/shared/ui';

/** Ключи подсказок-стартеров (`tutor.suggestions.*`). */
const SUGGESTIONS = ['today', 'explain', 'help', 'plan'] as const;

/** Сколько пикселей до низа считать «пользователь у конца ленты» — тогда следим за стримом. */
const FOLLOW_THRESHOLD = 160;

/** Ближайший скроллируемый предок (скролл-область AppLayout). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/** Пустой чат: маскот, приветствие и подсказки-стартеры, которые сразу отправляют вопрос. */
function EmptyChat({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  const { t } = useTranslation('student');
  const me = useMe();
  return (
    <Stack gap={5} align="center" grow justify="center">
      <Stack gap={3} align="center">
        <TutorAvatar size="xl" />
        <Stack gap={1} align="center">
          <Text variant="title" align="center">
            {me ? t('tutor.greeting', { name: me.user.firstName }) : t('tutor.greetingAnon')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t('tutor.intro')}
          </Text>
        </Stack>
      </Stack>
      <Inline gap={2} justify="center">
        {SUGGESTIONS.map((key) => (
          <Chip key={key} disabled={disabled} onClick={() => onPick(t(`tutor.suggestions.${key}`))}>
            {t(`tutor.suggestions.${key}`)}
          </Chip>
        ))}
      </Inline>
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => onStreamingChange?.(stream.isStreaming), [stream.isStreaming, onStreamingChange]);

  const send = useCallback(
    async (text: string) => {
      setPendingUserText(text);
      setAnnouncement('');
      const result = await stream.start(STREAMING_ROUTES.tutorMessage.path(conversationId), {
        text,
      });
      if (result.status === 'done') {
        await queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
        setPendingUserText(null);
        setAnnouncement(result.text);
        stream.reset();
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

  // Новое сообщение — прокручиваем к концу; во время стрима следим за текстом, только если
  // пользователь и так у конца ленты (не дёргаем, когда он читает выше).
  const messageCount = query.data?.items.length ?? 0;
  const scrollToEnd = useCallback((force: boolean) => {
    const scroller = scrollParent(bottomRef.current);
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (force || distance < FOLLOW_THRESHOLD) scroller.scrollTo({ top: scroller.scrollHeight });
  }, []);
  useEffect(() => scrollToEnd(true), [messageCount, pendingUserText, scrollToEnd]);
  useEffect(() => scrollToEnd(false), [stream.text, scrollToEnd]);

  // Ошибка первой отправки тоже не «пустой чат»: иначе alert с ошибкой пропадёт вместе с лентой.
  const isEmpty =
    messageCount === 0 && !pendingUserText && !stream.text && stream.status !== 'error';

  return (
    <Screen fill>
      <Stack gap={3} grow justify="end">
        <AsyncState query={query}>
          {(page) =>
            isEmpty ? (
              <EmptyChat onPick={(text) => void send(text)} disabled={stream.isStreaming} />
            ) : (
              <>
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
        sendLabel={t('tutor.send')}
        stopLabel={t('tutor.stop')}
      />
    </Screen>
  );
}
