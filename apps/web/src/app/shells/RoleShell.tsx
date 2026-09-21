import type { Role } from '@edu/contracts';
import { AppLayout, BottomNavigation } from '@edu/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { activeNavKey, BOTTOM_NAV } from '../bottom-nav.config';

export interface RoleShellProps {
  role: Role;
  header?: ReactNode;
  children?: ReactNode;
}

/** Общий каркас роли: AppLayout + нижнее меню из конфига + Outlet. */
export function RoleShell({ role, header, children }: RoleShellProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const items = BOTTOM_NAV[role];
  const active = activeNavKey(items, location.pathname);

  return (
    <AppLayout
      header={header}
      bottomNav={
        <BottomNavigation
          items={items.map((item) => ({
            key: item.key,
            label: t(item.labelKey),
            icon: <item.icon />,
            active: item.key === active,
            prominent: item.prominent,
          }))}
          onSelect={(key) => {
            const item = items.find((i) => i.key === key);
            if (item) navigate(item.path);
          }}
        />
      }
    >
      <AppLayout.Content>{children ?? <Outlet />}</AppLayout.Content>
    </AppLayout>
  );
}
