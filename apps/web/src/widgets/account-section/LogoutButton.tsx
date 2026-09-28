import { Button, LogoutIcon, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '@/shared/auth/hooks';
import { AUTH_PATH } from '@/shared/auth/role-routes';

export interface LogoutButtonProps {
  /** Подпись о приложении под кнопкой (по умолчанию есть; у ученика и родителя — нет). */
  showAbout?: boolean;
}

/** Выход из аккаунта (`POST /auth/logout`) + подпись о приложении. */
export function LogoutButton({ showAbout = true }: LogoutButtonProps = {}) {
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
      {showAbout && (
        <Text variant="caption" tone="muted" align="center">
          {t('settings.about')}
        </Text>
      )}
    </Stack>
  );
}
