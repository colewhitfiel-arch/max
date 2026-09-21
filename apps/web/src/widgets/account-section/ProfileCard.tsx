import { ROLE_LABELS } from '@edu/contracts';
import { Avatar, Card, ListRow } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '@/shared/auth/hooks';
import { fullName } from '@/shared/lib/format';

export interface ProfileCardProps {
  /** Куда ведёт карточка (например, `/student/profile`). Без пути — не кликабельна. */
  to?: string;
}

/** Карточка пользователя в шапке настроек: аватар, имя, роль; тап — на экран профиля. */
export function ProfileCard({ to }: ProfileCardProps) {
  const { t } = useTranslation('common');
  const { me } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const name = fullName(me.user);
  return (
    <Card padding="none">
      <ListRow
        left={<Avatar name={name} src={me.user.avatarUrl} size="lg" />}
        title={name}
        subtitle={me.activeRole ? ROLE_LABELS[me.activeRole] : undefined}
        onClick={to ? () => navigate(to) : undefined}
        aria-label={to ? t('settings.openProfile') : undefined}
      />
    </Card>
  );
}
