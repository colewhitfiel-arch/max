import type { ConversationDto } from '@edu/contracts';
import {
  Card,
  ChatComposer,
  ChatIcon,
  Chip,
  EmptyState,
  IconTile,
  Inline,
  ListRow,
  Screen,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { TutorAvatar, useConversations, useCreateConversation } from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/auth/hooks';
import { formatDateTime } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** Ключи подсказок-стартеров (`tutor.suggestions.*`). */
const SUGGESTIONS = ['today', 'explain', 'help', 'plan'] as const;

/** Сообщение, с которого начинается новый диалог: передаётся в `location.state`. */
export interface TutorConversationState {
  initialText?: string;
}

/**
 * `/student/tutor` — стартовый экран тьютора (F4): приветствие с маскотом, подсказки-стартеры,
 * список прошлых диалогов и поле ввода. Первое сообщение создаёт диалог и открывает его.
 */
export function TutorPage() {
  const { t, i18n } = useTranslation('student');
  const navigate = useNavigate();
  const toast = useToast();
  const me = useMe();
  const query = useConversations();
  const create = useCreateConversation();
  const [draft, setDraft] = useState('');

  const startConversation = (initialText: string) =>
    create.mutate(undefined, {
      onSuccess: (conversation) =>
        navigate(`/student/tutor/${conversation.id}`, {
          state: { initialText } satisfies TutorConversationState,
        }),
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });

  const openConversation = (conversation: ConversationDto) =>
    navigate(`/student/tutor/${conversation.id}`);

  return (
    <>
      <ScreenHeader title={t('tutor.title')} bell />
      <Screen gap={5} fill>
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

        <Inline gap={2} justify="center" aria-label={t('tutor.newConversation')}>
          {SUGGESTIONS.map((key) => (
            <Chip
              key={key}
              disabled={create.isPending}
              onClick={() => startConversation(t(`tutor.suggestions.${key}`))}
            >
              {t(`tutor.suggestions.${key}`)}
            </Chip>
          ))}
        </Inline>

        <Stack gap={3} grow>
          <Text as="h2" variant="body" weight="bold">
            {t('tutor.history')}
          </Text>
          <AsyncState
            query={query}
            isEmpty={(page) => page.items.length === 0}
            empty={
              <Card>
                <EmptyState
                  icon={<ChatIcon size={40} />}
                  title={t('tutor.empty')}
                  description={t('tutor.historyEmpty')}
                />
              </Card>
            }
          >
            {(page) => (
              <Card padding="none">
                {page.items.map((conversation) => (
                  <ListRow
                    key={conversation.id}
                    left={
                      <IconTile>
                        <ChatIcon />
                      </IconTile>
                    }
                    title={conversation.title ?? t('tutor.untitled')}
                    subtitle={
                      conversation.lastMessageAt
                        ? formatDateTime(conversation.lastMessageAt, i18n.language)
                        : undefined
                    }
                    onClick={() => openConversation(conversation)}
                  />
                ))}
              </Card>
            )}
          </AsyncState>
        </Stack>

        <ChatComposer
          sticky
          value={draft}
          onChange={setDraft}
          onSubmit={(text) => {
            setDraft('');
            startConversation(text);
          }}
          busy={create.isPending}
          placeholder={t('tutor.placeholder')}
          sendLabel={t('tutor.send')}
        />
      </Screen>
    </>
  );
}
