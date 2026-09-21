import { ROLE_LABELS } from '@edu/contracts';
import { AppLayout, Button, ErrorState, PageHeader, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

/** 501-страница администратора школы. */
export function AdminPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  return (
    <AppLayout header={<PageHeader title={ROLE_LABELS.SCHOOL_ADMIN} />}>
      <AppLayout.Content>
        <Screen>
          <ErrorState
            title={t('states.inDevelopment')}
            description={t('states.inDevelopmentHint')}
          />
          <Button variant="secondary" fullWidth onClick={() => navigate('/auth/switch')}>
            {t('actions.switchRole')}
          </Button>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
