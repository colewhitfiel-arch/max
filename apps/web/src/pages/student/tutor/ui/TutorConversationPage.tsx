import { STREAMING_ROUTES } from '@edu/contracts';
import { Button, EmptyState, Inline, Screen, Stack, Text, Textarea } from '@edu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { aiKeys, ChatMessage, useMessages } from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** `/student/tutor/:conversationId` — история + отправка сообщения через SSE (F4). */
export function TutorConversationPage() {
  const { conversationId = '' } = useParams();
  const { t } = useTranslation('student');
  const queryClient = useQueryClient();
  const query = useMessages(conversationId);
  const stream = useAiStream();
  const [draft, setDraft] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || stream.isStreaming) return;
    setDraft('');
    setPendingUserText(text);
    const result = await stream.start(STREAMING_ROUTES.tutorMessage.path(conversationId), { text });
    if (result.status === 'done') {
      await queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
      setPendingUserText(null);
      stream.reset();
    }
  };

  return (
    <>
      <ScreenHeader title={t('tutor.title')} back="/student/tutor" />
      <Screen>
        <AsyncState query={query}>
          {(page) => (
            <Stack gap={2}>
              {page.items.length === 0 && !pendingUserText && (
                <EmptyState title={t('tutor.noMessages')} />
              )}
              {page.items.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.createdAt}
                />
              ))}
              {pendingUserText && <ChatMessage role="USER" content={pendingUserText} />}
              {(stream.isStreaming || stream.text) && (
                <ChatMessage
                  role="ASSISTANT"
                  content={stream.text}
                  streaming={stream.isStreaming}
                />
              )}
              {stream.isStreaming && (
                <Text variant="caption" tone="muted">
                  {t('tutor.thinking')}
                </Text>
              )}
              {stream.status === 'error' && stream.error && (
                <Text tone="danger" role="alert">
                  {describeApiError(stream.error)}
                </Text>
              )}
            </Stack>
          )}
        </AsyncState>

        <form onSubmit={(event) => void onSubmit(event)}>
          <Stack gap={2}>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('tutor.placeholder')}
              rows={2}
              disabled={stream.isStreaming}
            />
            <Inline justify="end">
              <Button type="submit" disabled={!draft.trim()} loading={stream.isStreaming}>
                {t('tutor.send')}
              </Button>
            </Inline>
          </Stack>
        </form>
      </Screen>
    </>
  );
}
