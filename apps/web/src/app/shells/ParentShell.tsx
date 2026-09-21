import { IconButton, Inline, Screen, SettingsIcon, Spinner } from '@edu/ui';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ChildSwitcher, useChildren } from '@/entities/student';
import { RequireAuth, RequireRole } from '@/shared/auth/guards';
import { useUiStore } from '@/shared/store/ui-store';
import { RoleShell } from './RoleShell';

const CHILDREN_PATH = '/parent/children';
const SETTINGS_PATH = '/parent/settings';

/** `/parent/*`: в шапке — выбор ребёнка; без детей — редирект на привязку (F9). */
export function ParentShell() {
  return (
    <RequireAuth>
      <RequireRole role="PARENT">
        <ParentShellInner />
      </RequireRole>
    </RequireAuth>
  );
}

function ParentShellInner() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const childrenQuery = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  const items = useMemo(() => childrenQuery.data?.items ?? [], [childrenQuery.data]);

  // Выбранный ребёнок должен быть в списке; иначе — первый.
  useEffect(() => {
    if (!childrenQuery.data) return;
    const exists = items.some((child) => child.student.id === selectedChildId);
    if (!exists) setSelectedChildId(items[0]?.student.id ?? null);
  }, [childrenQuery.data, items, selectedChildId, setSelectedChildId]);

  const onChildrenPage = location.pathname.startsWith(CHILDREN_PATH);
  const onSettingsPage = location.pathname.startsWith(SETTINGS_PATH);
  if (childrenQuery.isSuccess && items.length === 0 && !onChildrenPage && !onSettingsPage) {
    return <Navigate to={CHILDREN_PATH} replace />;
  }

  const header = (
    <Screen padding="sm" gap={0}>
      <Inline justify="between" wrap={false} gap={2}>
        {childrenQuery.isPending ? (
          <Spinner size="sm" />
        ) : (
          <ChildSwitcher children={items} value={selectedChildId} onChange={setSelectedChildId} />
        )}
        <IconButton aria-label={t('nav.settings')} onClick={() => navigate(SETTINGS_PATH)}>
          <SettingsIcon />
        </IconButton>
      </Inline>
    </Screen>
  );

  return <RoleShell role="PARENT" header={header} />;
}
