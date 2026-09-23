import { STREAMING_ROUTES } from '@edu/contracts';
import { ChatComposer, Chip, Inline, Screen, Stack, Text } from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aiKeys,
  ChatMessage,
  ChatMessageList,
  TutorAvatar,
  useParentMessages,
} from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { useMe } from '@/shared/auth/hooks';
import { AsyncState } from '@/shared/ui';

/** Ключи подсказок-стартеров (`suggestions.*`). */
const SUGGESTIONS = ['progress', 'overdue', 'help', 'motivation'] as const;

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

/** Пустой чат: маскот, приветствие родителя и подсказки про ребёнка, которые сразу отправляют вопрос. */
function EmptyChat({
  childName,
  onPick,
  disabled,
}: {
  childName: string;
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('parent-tutor');
  const me = useMe();
  return (
    <Stack gap={5} align="center" grow justify="center">
      <Stack gap={3} align="center">
        <TutorAvatar size="xl" />
        <Stack gap={1} align="center">
          <Text variant="title" align="center">
            {me ? t('greeting', { name: me.user.firstName }) : t('greetingAnon')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t('intro', { name: childName })}
          </Text>
        </Stack>
      </Stack>
      <Inline gap={2} justify="center">
        {SUGGESTIONS.map((key) => {
          const text = t(`suggestions.${key}`, { name: childName });
          return (
            <Chip key={key} disabled={disabled} onClick={() => onPick(text)}>
              {text}
            </Chip>
          );
        })}
      </Inline>
    </Stack>
  );
}

export interface ParentTutorChatProps {
  conversationId: string;
  /** Имя ребёнка для приветствия и подсказок. */
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => onStreamingChange?.(stream.isStreaming), [stream.isStreaming, onStreamingChange]);
  // Смена ребёнка размонтирует ленту посреди стрима — шапка не должна остаться в «печатает…».
  useEffect(() => () => onStreamingChange?.(false), [onStreamingChange]);

  const send = useCallback(
    async (text: string) => {
      setPendingUserText(text);
      const result = await stream.start(STREAMING_ROUTES.parentTutorMessage.path(conversationId), {
        text,
      });
      if (result.status === 'done') {
        await queryClient.invalidateQueries({ queryKey: aiKeys.parentMessages(conversationId) });
        setPendingUserText(null);
        stream.reset();
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

  const isEmpty = messageCount === 0 && !pendingUserText && !stream.text;

  return (
    <Screen fill>
      <Stack gap={3} grow justify="end" aria-live="polite">
        <AsyncState query={query}>
          {(page) =>
            isEmpty ? (
              <EmptyChat
                childName={childName}
                onPick={(text) => void send(text)}
                disabled={stream.isStreaming}
              />
            ) : (
              <>
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
        sendLabel={t('send')}
        stopLabel={t('stop')}
      />
    </Screen>
  );
}
