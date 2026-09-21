import { Button, Card, EmptyState, ListRow, PlusIcon, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useConversations, useCreateConversation } from '@/entities/ai';
import { formatDateTime } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** `/student/tutor` — список диалогов с тьютором (F4). */
export function TutorPage() {
  const { t, i18n } = useTranslation('student');
  const navigate = useNavigate();
  const query = useConversations();
  const create = useCreateConversation();

  const onCreate = () =>
    create.mutate(undefined, {
      onSuccess: (conversation) => navigate(`/student/tutor/${conversation.id}`),
    });

  const newButton = (
    <Button leftIcon={<PlusIcon />} loading={create.isPending} onClick={onCreate} fullWidth>
      {t('tutor.newConversation')}
    </Button>
  );

  return (
    <>
      <ScreenHeader title={t('tutor.title')} bell />
      <Screen>
        {newButton}
        <AsyncState
          query={query}
          isEmpty={(page) => page.items.length === 0}
          empty={<EmptyState title={t('tutor.empty')} description={t('tutor.emptyHint')} />}
        >
          {(page) => (
            <Card padding="none">
              {page.items.map((conversation) => (
                <ListRow
                  key={conversation.id}
                  title={conversation.title ?? t('tutor.untitled')}
                  subtitle={
                    conversation.lastMessageAt
                      ? formatDateTime(conversation.lastMessageAt, i18n.language)
                      : undefined
                  }
                  onClick={() => navigate(`/student/tutor/${conversation.id}`)}
                />
              ))}
            </Card>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
