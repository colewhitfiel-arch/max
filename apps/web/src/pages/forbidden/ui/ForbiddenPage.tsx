import { AppLayout, Button, ErrorState, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

export function ForbiddenPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  return (
    <AppLayout>
      <AppLayout.Content>
        <Screen>
          <ErrorState title={t('states.forbidden')} description={t('states.forbiddenHint')} />
          <Button variant="secondary" fullWidth onClick={() => navigate('/', { replace: true })}>
            {t('actions.goHome')}
          </Button>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
