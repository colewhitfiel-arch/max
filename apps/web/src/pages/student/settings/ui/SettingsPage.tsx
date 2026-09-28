import { Screen, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { config } from '@/shared/config';
import { ScreenHeader } from '@/shared/ui';
import {
  AccountSettings,
  AppearanceSettings,
  LogoutButton,
  ProfileCard,
} from '@/widgets/account-section';

/**
 * `/student/settings` — карточка профиля, тема оформления, роль и поддержка, выход. Без
 * уведомлений и выбора языка; «Поддержка» открывает чат поддержки в MAX (`VITE_SUPPORT_URL`).
 * Секции — `widgets/account-section`.
 */
export function SettingsPage() {
  const { t } = useTranslation('student');
  return (
    <>
      <ScreenHeader title={t('settings.title')} bell />
      <Screen gap={5}>
        <Stack gap={5}>
          <ProfileCard to="/student/profile" />
          <AppearanceSettings showLanguage={false} />
          <AccountSettings supportUrl={config.supportUrl} />
          <LogoutButton showAbout={false} />
        </Stack>
      </Screen>
    </>
  );
}
