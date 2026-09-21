import { ROLE_LABELS, type Role } from '@edu/contracts';
import { Badge, Card, ListRow, useToast } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { roleHomePath } from '@/shared/auth/role-routes';

/** Список ролей пользователя; тап по неактивной — `POST /auth/switch-role` и переход на её главную (F11). */
export function SwitchRole() {
  const { t } = useTranslation('auth');
  const { me, switchRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, setPending] = useState<Role | null>(null);

  if (!me) return null;

  const onSelect = async (role: Role) => {
    if (role === me.activeRole || pending) return;
    setPending(role);
    try {
      await switchRole(role);
      toast.show({ tone: 'success', title: t('switch.switched') });
      navigate(roleHomePath(role), { replace: true });
    } catch (error) {
      toast.show({ tone: 'danger', title: describeApiError(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <Card padding="none">
      {me.roles.map((role) => {
        const active = role === me.activeRole;
        return (
          <ListRow
            key={role}
            title={ROLE_LABELS[role]}
            right={active ? <Badge tone="success">{t('switch.active')}</Badge> : undefined}
            onClick={active ? undefined : () => void onSelect(role)}
            disabled={pending !== null}
            aria-current={active ? 'true' : undefined}
          />
        );
      })}
    </Card>
  );
}
