import { Button, LogoutIcon, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '@/shared/auth/hooks';
import { AUTH_PATH } from '@/shared/auth/role-routes';

export interface LogoutButtonProps {
  /** Подпись о приложении под кнопкой. По умолчанию есть; у родителя скрыта. */
  about?: boolean;
}

/** Выход из аккаунта (`POST /auth/logout`) + подпись о приложении. */
export function LogoutButton({ about = true }: LogoutButtonProps = {}) {
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
      {about && (
        <Text variant="caption" tone="muted" align="center">
          {t('settings.about')}
        </Text>
      )}
    </Stack>
  );
}
