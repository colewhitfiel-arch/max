import { AppLayout, PageHeader, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { SwitchRole } from '@/features/switch-role';

/** `/auth/switch`: переключение активной роли (F11). */
export function SwitchRolePage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  return (
    <AppLayout
      header={
        <PageHeader
          title={t('switch.title')}
          subtitle={t('switch.subtitle')}
          onBack={() => navigate(-1)}
        />
      }
    >
      <AppLayout.Content>
        <Screen>
          <SwitchRole />
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
