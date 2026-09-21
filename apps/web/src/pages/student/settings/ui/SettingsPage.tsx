import { Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '@/shared/ui';
import { AccountSection } from '@/widgets/account-section';

/**
 * `/student/settings` — карточка профиля, внешний вид (тема/язык), уведомления,
 * роль и поддержка, выход. Секции — `widgets/account-section` + `widgets/notification-settings`.
 */
export function SettingsPage() {
  const { t } = useTranslation('student');
  return (
    <>
      <ScreenHeader title={t('settings.title')} bell />
      <Screen gap={5}>
        <AccountSection profilePath="/student/profile" />
      </Screen>
    </>
  );
}
