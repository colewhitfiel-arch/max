import { Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '@/shared/ui';
import { AccountSection } from '@/widgets/account-section';

/** `/student/settings` — тема/язык (`PATCH /me/settings`), смена роли, поддержка, выход. */
export function SettingsPage() {
  const { t } = useTranslation('student');
  return (
    <>
      <ScreenHeader title={t('settings.title')} bell />
      <Screen>
        <AccountSection />
      </Screen>
    </>
  );
}
