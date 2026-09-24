import { AppLayout, Button, PageHeader, PlusIcon, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { SwitchRole } from '@/features/switch-role';
import { useAuth } from '@/shared/auth/hooks';
import { ROLE_SETUP_PATH } from '@/shared/auth/role-routes';
import { canAddRole } from '../model';

/**
 * `/auth/switch`: переключение активной роли (F11). Под списком — «Добавить роль» (`/auth/role`),
 * пока есть что добавить: с одной ролью экран иначе был бы тупиком.
 */
export function SwitchRolePage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { me } = useAuth();
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
          {me && canAddRole(me.roles) && (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<PlusIcon />}
              onClick={() => navigate(ROLE_SETUP_PATH)}
            >
              {t('common:actions.addRole')}
            </Button>
          )}
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
