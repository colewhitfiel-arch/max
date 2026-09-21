import type { Role } from '@edu/contracts';
import { Stack } from '@edu/ui';
import { useAuth } from '@/shared/auth/hooks';
import { NotificationSettings } from '@/widgets/notification-settings';
import { AccountSettings } from './AccountSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { LogoutButton } from './LogoutButton';
import { ProfileCard } from './ProfileCard';

export interface AccountSectionProps {
  /** Путь к экрану профиля роли для карточки пользователя. */
  profilePath?: string;
}

/**
 * Общий блок «аккаунт» для настроек всех ролей: карточка пользователя, внешний вид
 * (тема/язык), уведомления, роль и поддержка, выход.
 */
export function AccountSection({ profilePath }: AccountSectionProps) {
  const { me } = useAuth();
  if (!me) return null;
  const role: Role = me.activeRole ?? 'STUDENT';
  return (
    <Stack gap={5}>
      <ProfileCard to={profilePath} />
      <AppearanceSettings />
      <NotificationSettings role={role} />
      <AccountSettings />
      <LogoutButton />
    </Stack>
  );
}
