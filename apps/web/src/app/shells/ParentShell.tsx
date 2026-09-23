import { useEffect, useMemo } from 'react';
import { useChildren } from '@/entities/student';
import { RequireAuth, RequireRole } from '@/shared/auth/guards';
import { useUiStore } from '@/shared/store/ui-store';
import { RoleShell } from './RoleShell';

/**
 * `/parent/*`: шапки у shell нет — экраны рисуют свою (на главной — аватар, кошелёк и
 * дети-сердца). Без детей редиректа нет: главная показывает сердце «+», аналитика и
 * тьютор — свои пустые состояния (F9). Зелёный акцент родителя включает `App` по активной
 * роли — так он действует и на общих экранах (`/notifications`).
 */
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
  const childrenQuery = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  const items = useMemo(() => childrenQuery.data?.items ?? [], [childrenQuery.data]);

  // Выбранный ребёнок должен быть в списке; иначе — первый (или никто, если детей нет).
  useEffect(() => {
    if (!childrenQuery.data) return;
    const exists = items.some((child) => child.student.id === selectedChildId);
    if (!exists) setSelectedChildId(items[0]?.student.id ?? null);
  }, [childrenQuery.data, items, selectedChildId, setSelectedChildId]);

  return <RoleShell role="PARENT" />;
}
