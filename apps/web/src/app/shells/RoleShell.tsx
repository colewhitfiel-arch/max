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
  /**
   * Экраны роли ровно по высоте области между шапкой и меню (`AppLayout.Content fit`):
   * `Screen fill` под шапкой экрана не даёт лишней прокрутки. По умолчанию выключено.
   */
  fitContent?: boolean;
}

/** Общий каркас роли: AppLayout + нижнее меню из конфига + Outlet. */
export function RoleShell({ role, header, children, fitContent = false }: RoleShellProps) {
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
            iconSize: item.iconSize,
          }))}
          onSelect={(key) => {
            const item = items.find((i) => i.key === key);
            // Повторный тап по открытому экрану историю не наращивает; возврат к корню активного
            // раздела с его подэкрана — replace; переход в другой раздел — push.
            if (!item || location.pathname === item.path) return;
            navigate(item.path, { replace: item.key === active });
          }}
        />
      }
    >
      <AppLayout.Content fit={fitContent}>{children ?? <Outlet />}</AppLayout.Content>
    </AppLayout>
  );
}
