import { Button } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useMarkRead } from '@/entities/notification';

export interface MarkReadButtonProps {
  /** id уведомлений; без них — отметить все. */
  ids?: string[];
  size?: 'sm' | 'md';
  disabled?: boolean;
}

/** «Прочитано» / «Прочитать все» → `POST /notifications/read` с оптимистичным обновлением. */
export function MarkReadButton({ ids, size = 'sm', disabled }: MarkReadButtonProps) {
  const { t } = useTranslation('common');
  const markRead = useMarkRead();
  return (
    <Button
      variant="ghost"
      size={size}
      loading={markRead.isPending}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        markRead.mutate(ids);
      }}
    >
      {ids ? t('actions.markRead') : t('actions.markAllRead')}
    </Button>
  );
}
