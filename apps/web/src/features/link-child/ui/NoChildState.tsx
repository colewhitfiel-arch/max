import { Button, EmptyState, HeartAvatar } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChildren } from '@/entities/student';
import { useUiStore } from '@/shared/store/ui-store';
import { ListSkeleton, QueryError } from '@/shared/ui';
import { AddChildSheet } from './AddChildSheet';

/**
 * Экран про выбранного ребёнка (оплата, кружки), а ребёнок не выбран: пока грузится список
 * детей (или ребёнок вот-вот будет выбран) — скелет, ошибка — повтор, детей нет — пустое
 * состояние с «Добавить ребёнка» (AddChildSheet). Привязанный по коду сразу выбирается.
 */
export function NoChildState() {
  const { t } = useTranslation('parent');
  const query = useChildren();
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  const [addOpen, setAddOpen] = useState(false);

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }
  // Есть подтверждённые дети — ParentShell выберет первого на следующем кадре. Только PENDING
  // или отвязанные выбрать нельзя — показываем «Добавить ребёнка», а не вечный скелет.
  if (!query.data || query.data.items.some((child) => child.linkStatus === 'ACTIVE')) {
    return <ListSkeleton />;
  }
  return (
    <>
      <EmptyState
        icon={
          <HeartAvatar aria-hidden="true" add tone="plain" size={72} name={t('children.add')} />
        }
        title={t('children.empty')}
        description={t('children.emptyHint')}
        action={<Button onClick={() => setAddOpen(true)}>{t('children.add')}</Button>}
      />
      <AddChildSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onLinked={setSelectedChildId}
      />
    </>
  );
}
