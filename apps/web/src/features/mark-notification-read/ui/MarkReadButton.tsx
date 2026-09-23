import { Button, CheckIcon, IconButton, useToast } from '@edu/ui';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMarkRead } from '@/entities/notification';
import { describeApiError } from '@/shared/api/errors';

export interface MarkReadButtonProps {
  /** id уведомлений; без них — отметить все. */
  ids?: string[];
  size?: 'sm' | 'md';
  disabled?: boolean;
  /**
   * Иконка-галочка вместо текста (узкие строки, панель уведомлений). По умолчанию — у кнопки
   * конкретных уведомлений (`ids`); «Прочитать все» остаётся текстовой.
   */
  compact?: boolean;
}

/** «Прочитано» / «Прочитать все» → `POST /notifications/read` с оптимистичным обновлением. */
export function MarkReadButton({ ids, size = 'sm', disabled, compact }: MarkReadButtonProps) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const markRead = useMarkRead();
  const label = ids ? t('actions.markRead') : t('actions.markAllRead');

  // Кнопка живёт внутри кликабельной строки: клик и Enter/Space не должны доходить до строки.
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    markRead.mutate(ids, {
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => event.stopPropagation();

  if (compact ?? ids !== undefined) {
    return (
      <IconButton
        size={size}
        aria-label={label}
        title={label}
        loading={markRead.isPending}
        disabled={disabled}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <CheckIcon />
      </IconButton>
    );
  }

  return (
    <Button
      variant="ghost"
      size={size}
      loading={markRead.isPending}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {label}
    </Button>
  );
}
