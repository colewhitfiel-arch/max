import { Button, LogoutIcon, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '@/shared/auth/hooks';
import { AUTH_PATH } from '@/shared/auth/role-routes';

/** Выход из аккаунта (`POST /auth/logout`) + подпись о приложении. */
export function LogoutButton() {
  const { t } = useTranslation('common');
  const { logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate(AUTH_PATH, { replace: true });
  };

  return (
    <Stack gap={3} align="center">
      <Button
        variant="secondary"
        fullWidth
        leftIcon={<LogoutIcon />}
        onClick={() => void onLogout()}
      >
        {t('settings.logout')}
      </Button>
      <Text variant="caption" tone="muted" align="center">
        {t('settings.about')}
      </Text>
    </Stack>
  );
}
