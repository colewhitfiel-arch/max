import { STREAMING_ROUTES, type AiMessageDto } from '@edu/contracts';
import {
  Button,
  ChatComposer,
  IconButton,
  Modal,
  Screen,
  Stack,
  Text,
  TrashIcon,
  useToast,
} from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { aiKeys, ChatMessage, useDeleteConversation, useMessages } from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { formatRelativeDay, isSameDay } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import type { TutorConversationState } from './TutorPage';

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

/** Сколько пикселей до низа считать «пользователь у конца ленты» — тогда следим за стримом. */
const FOLLOW_THRESHOLD = 160;

/** Разделитель дня между сообщениями («сегодня», «вчера», «21 сент.»). */
function DayDivider({ date }: { date: string }) {
  const { i18n } = useTranslation();
  const label = formatRelativeDay(date, i18n.language);
  return (
    <Text variant="caption" tone="muted" align="center" role="separator" aria-label={label}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Text>
  );
}

/** Сообщения с разделителями дней. */
function MessageList({ items }: { items: AiMessageDto[] }) {
  return (
    <>
      {items.map((message, index) => {
        const previous = items[index - 1];
        const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
        return (
          <Stack key={message.id} gap={3}>
            {newDay && <DayDivider date={message.createdAt} />}
            <ChatMessage
              role={message.role}
              content={message.content}
              createdAt={message.createdAt}
            />
          </Stack>
        );
      })}
    </>
  );
}

/**
 * `/student/tutor/:conversationId` — диалог с тьютором (F4): пузыри сообщений, стрим ответа
 * через SSE с индикатором набора и кнопкой «Стоп», поле ввода прижато к низу.
 * Первое сообщение нового диалога приходит через `location.state.initialText`.
 */
export function TutorConversationPage() {
  const { conversationId = '' } = useParams();
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useMessages(conversationId);
  const remove = useDeleteConversation();
  const stream = useAiStream();
  const [draft, setDraft] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Guard от повторной отправки стартового сообщения (StrictMode вызывает эффекты дважды).
  const initialSentRef = useRef(false);

  const send = useCallback(
    async (text: string) => {
      setPendingUserText(text);
      const result = await stream.start(STREAMING_ROUTES.tutorMessage.path(conversationId), {
        text,
      });
      if (result.status === 'done') {
        await queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
        // Заголовок диалога появляется после первого сообщения — обновим список.
        void queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
        setPendingUserText(null);
        stream.reset();
      }
    },
    [conversationId, queryClient, stream],
  );

  // Стартовое сообщение нового диалога — отправляем один раз и чистим state, чтобы не повторить
  // при возврате назад.
  const initialText = (location.state as TutorConversationState | null)?.initialText;
  useEffect(() => {
    if (!initialText || initialSentRef.current) return;
    initialSentRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void send(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при первом рендере с state
  }, []);

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

  const onDelete = () =>
    remove.mutate(conversationId, {
      onSuccess: () => {
        toast.show({ tone: 'success', title: t('tutor.deleted') });
        navigate('/student/tutor', { replace: true });
      },
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });

  return (
    <>
      <ScreenHeader
        title={t('tutor.assistant')}
        subtitle={stream.isStreaming ? t('tutor.typing') : t('tutor.online')}
        back="/student/tutor"
        actions={
          <IconButton
            aria-label={t('tutor.delete')}
            onClick={() => setConfirmDelete(true)}
            disabled={remove.isPending}
          >
            <Text as="span" tone="muted">
              <TrashIcon />
            </Text>
          </IconButton>
        }
      />
      <Screen fill>
        <Stack gap={3} grow justify="end" aria-live="polite">
          <AsyncState query={query}>
            {(page) => (
              <>
                {page.items.length === 0 && !pendingUserText && (
                  <ChatMessage role="ASSISTANT" content={t('tutor.emptyChat')} />
                )}
                <MessageList items={page.items} />
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
            )}
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
          placeholder={t('tutor.placeholder')}
          sendLabel={t('tutor.send')}
          stopLabel={t('tutor.stop')}
        />
      </Screen>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('tutor.delete')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={onDelete}>
              {tc('actions.delete')}
            </Button>
          </>
        }
      >
        <Text>{t('tutor.deleteConfirm')}</Text>
      </Modal>
    </>
  );
}
