import { Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '@/shared/ui';
import { AccountSection } from '@/widgets/account-section';

/** `/parent/settings` — аккаунт родителя (тема, роль, выход). Доступ — из шапки ParentShell. */
export function ParentSettingsPage() {
  const { t } = useTranslation('common');
  return (
    <>
      <ScreenHeader title={t('nav.settings')} back="/parent" bell />
      <Screen>
        <AccountSection />
      </Screen>
    </>
  );
}
