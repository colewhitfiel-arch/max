import {
  BookIcon,
  Card,
  CreditCardIcon,
  IconTile,
  ListRow,
  Screen,
  UsersIcon,
  WalletIcon,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PARENT_WALLET_PATH } from '@/shared/lib/parent-paths';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { ScreenHeader } from '@/shared/ui';
import {
  AccountSettings,
  AppearanceSettings,
  LogoutButton,
  ProfileCard,
  SettingsGroup,
} from '@/widgets/account-section';

/**
 * «Семья и оплата»: разделы родителя, которых нет в нижнем меню, — дети (привязка по коду
 * или ссылке), кошелёк, оплата и кружки детей.
 */
function FamilySettings() {
  const { t } = useTranslation('parent-profile');
  const navigate = useNavigate();
  return (
    <SettingsGroup title={t('settings.family')}>
      <Card padding="none">
        <ListRow
          left={
            <IconTile tone="success">
              <UsersIcon />
            </IconTile>
          }
          title={t('settings.children')}
          subtitle={t('settings.childrenHint')}
          chevron
          onClick={() => navigate('/parent/children', { state: FROM_APP_STATE })}
        />
        <ListRow
          left={
            <IconTile tone="info">
              <WalletIcon />
            </IconTile>
          }
          title={t('settings.wallet')}
          subtitle={t('settings.walletHint')}
          chevron
          onClick={() => navigate(PARENT_WALLET_PATH, { state: FROM_APP_STATE })}
        />
        <ListRow
          left={
            <IconTile tone="warning">
              <CreditCardIcon />
            </IconTile>
          }
          title={t('settings.payments')}
          chevron
          onClick={() => navigate('/parent/payments', { state: FROM_APP_STATE })}
        />
        <ListRow
          left={
            <IconTile>
              <BookIcon />
            </IconTile>
          }
          title={t('settings.clubs')}
          chevron
          onClick={() => navigate('/parent/courses', { state: FROM_APP_STATE })}
        />
      </Card>
    </SettingsGroup>
  );
}

/**
 * `/parent/settings`: карточка профиля, «Семья и оплата», внешний вид (только тема), роль и
 * поддержка, выход. Без уведомлений, выбора языка и подписи о приложении — у родителя их нет.
 * Секции — `widgets/account-section`.
 */
export function ParentSettingsPage() {
  const { t } = useTranslation('parent-profile');
  return (
    <>
      <ScreenHeader title={t('settings.title')} bell />
      <Screen gap={5}>
        <ProfileCard to="/parent/profile" />
        <FamilySettings />
        <AppearanceSettings showLanguage={false} />
        <AccountSettings />
        <LogoutButton showAbout={false} />
      </Screen>
    </>
  );
}
