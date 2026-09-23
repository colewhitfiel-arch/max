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
import { FROM_APP_STATE, WALLET_PATH } from '@/pages/parent/wallet/paths';
import { ScreenHeader } from '@/shared/ui';
import {
  AccountSettings,
  AppearanceSettings,
  LogoutButton,
  ProfileCard,
  SettingsGroup,
} from '@/widgets/account-section';
import { NotificationSettings } from '@/widgets/notification-settings';

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
          onClick={() => navigate('/parent/children')}
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
          onClick={() => navigate(WALLET_PATH, { state: FROM_APP_STATE })}
        />
        <ListRow
          left={
            <IconTile tone="warning">
              <CreditCardIcon />
            </IconTile>
          }
          title={t('settings.payments')}
          chevron
          onClick={() => navigate('/parent/payments')}
        />
        <ListRow
          left={
            <IconTile>
              <BookIcon />
            </IconTile>
          }
          title={t('settings.clubs')}
          chevron
          onClick={() => navigate('/parent/courses')}
        />
      </Card>
    </SettingsGroup>
  );
}

/**
 * `/parent/settings` — как у ученика: карточка профиля, внешний вид (тема/язык), уведомления,
 * роль и поддержка, выход; плюс «Семья и оплата». Секции — `widgets/account-section`.
 */
export function ParentSettingsPage() {
  const { t } = useTranslation('parent-profile');
  return (
    <>
      <ScreenHeader title={t('settings.title')} bell />
      <Screen gap={5}>
        <ProfileCard to="/parent/profile" />
        <FamilySettings />
        <AppearanceSettings />
        <NotificationSettings role="PARENT" />
        <AccountSettings />
        <LogoutButton />
      </Screen>
    </>
  );
}
