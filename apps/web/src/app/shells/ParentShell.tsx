import type { ChildBrief } from '@edu/contracts';
import { useEffect } from 'react';
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

/**
 * Кто должен быть выбран: текущий, если он среди ACTIVE, иначе первый ACTIVE (или никто).
 * PENDING/отвязанный ребёнок — не «текущий»: его данные сервер не отдаёт.
 */
export function resolveSelectedChild(
  items: readonly ChildBrief[],
  selectedChildId: string | null,
): string | null {
  const active = items.filter((child) => child.linkStatus === 'ACTIVE');
  if (active.some((child) => child.student.id === selectedChildId)) return selectedChildId;
  return active[0]?.student.id ?? null;
}

function ParentShellInner() {
  const childrenQuery = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  useEffect(() => {
    if (!childrenQuery.data) return;
    const next = resolveSelectedChild(childrenQuery.data.items, selectedChildId);
    if (next !== selectedChildId) setSelectedChildId(next);
  }, [childrenQuery.data, selectedChildId, setSelectedChildId]);

  return <RoleShell role="PARENT" />;
}
