import {
  BookIcon,
  Card,
  IconTile,
  ListRow,
  Screen,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { TEACHER_WALLET_PATH } from '@/shared/lib/teacher-paths';
import { ScreenHeader } from '@/shared/ui';
import {
  AccountSettings,
  AppearanceSettings,
  LogoutButton,
  ProfileCard,
  SettingsGroup,
} from '@/widgets/account-section';

/**
 * «Работа»: разделы репетитора, которых нет в нижнем меню, — кошелёк (он же открывается чипом
 * на главной), группы, курсы, конструктор курса и спрос на кружки.
 */
function WorkSettings() {
  const { t } = useTranslation('teacher-profile');
  const navigate = useNavigate();
  return (
    <SettingsGroup title={t('settings.work')}>
      <Card padding="none">
        <ListRow
          left={
            <IconTile tone="warning">
              <WalletIcon />
            </IconTile>
          }
          title={t('settings.wallet')}
          subtitle={t('settings.walletHint')}
          chevron
          onClick={() => navigate(TEACHER_WALLET_PATH, { state: FROM_APP_STATE })}
        />
        <ListRow
          left={
            <IconTile tone="success">
              <UsersIcon />
            </IconTile>
          }
          title={t('settings.groups')}
          subtitle={t('settings.groupsHint')}
          chevron
          onClick={() => navigate('/teacher/groups')}
        />
        <ListRow
          left={
            <IconTile tone="info">
              <BookIcon />
            </IconTile>
          }
          title={t('settings.courses')}
          subtitle={t('settings.coursesHint')}
          chevron
          onClick={() => navigate('/teacher/courses')}
        />
        <ListRow
          left={
            <IconTile>
              <TargetIcon />
            </IconTile>
          }
          title={t('settings.clubDemand')}
          subtitle={t('settings.clubDemandHint')}
          chevron
          onClick={() => navigate('/teacher/clubs/demand')}
        />
      </Card>
    </SettingsGroup>
  );
}

/**
 * `/teacher/settings` — карточка профиля, «Работа», внешний вид (только тема), роль (смена на
 * другую роль) и поддержка, выход. Уведомлений, языка и подписи о приложении у преподавателя
 * нет. Заменяет прежний экран «Ещё» (`/teacher/more` — редирект сюда).
 */
export function TeacherSettingsPage() {
  const { t } = useTranslation('teacher-profile');
  return (
    <>
      <ScreenHeader title={t('settings.title')} bell />
      <Screen gap={5}>
        <ProfileCard to="/teacher/profile" />
        <WorkSettings />
        <AppearanceSettings />
        <AccountSettings />
        <LogoutButton showAbout={false} />
      </Screen>
    </>
  );
}
