import { AppLayout, Button, EmptyState, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  return (
    <AppLayout>
      <AppLayout.Content>
        <Screen>
          <EmptyState
            title={t('states.notFound')}
            description={t('states.notFoundHint')}
            action={
              <Button onClick={() => navigate('/', { replace: true })}>
                {t('actions.goHome')}
              </Button>
            }
          />
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
