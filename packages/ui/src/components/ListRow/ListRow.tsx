import { forwardRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { ChevronRightIcon } from '../../icons';
import './ListRow.css';

export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Основной текст. */
  title: ReactNode;
  /** Вторая строка, приглушённая. */
  subtitle?: ReactNode;
  /** Слот слева (аватар, иконка). */
  left?: ReactNode;
  /** Слот справа (бейдж, значение, стрелка). */
  right?: ReactNode;
  /** Если задан — строка становится кнопкой (`role="button"`, Enter/Space). */
  onClick?: HTMLAttributes<HTMLDivElement>['onClick'];
  /** Показывать шеврон справа (по умолчанию — если есть `onClick` и нет `right`). */
  chevron?: boolean;
  /** Недоступна для нажатия. */
  disabled?: boolean;
}

/** Строка списка: left | title/subtitle | right. Вкладывается в `Card padding="none"` или `Stack`. */
export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  {
    title,
    subtitle,
    left,
    right,
    onClick,
    chevron,
    disabled = false,
    className,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const interactive = typeof onClick === 'function';
  const showChevron = chevron ?? (interactive && right == null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!interactive || disabled || event.defaultPrevented) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <div
      ref={ref}
      className={cx('ui-list-row', className)}
      data-interactive={interactive || undefined}
      data-disabled={disabled || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
      onClick={interactive && !disabled ? onClick : undefined}
      onKeyDown={interactive ? handleKeyDown : onKeyDown}
      {...rest}
    >
      {left != null && <div className="ui-list-row__left">{left}</div>}
      <div className="ui-list-row__body">
        <div className="ui-list-row__title">{title}</div>
        {subtitle != null && <div className="ui-list-row__subtitle">{subtitle}</div>}
      </div>
      {right != null && <div className="ui-list-row__right">{right}</div>}
      {showChevron && (
        <ChevronRightIcon className="ui-list-row__chevron" size={20} aria-hidden="true" />
      )}
    </div>
  );
});
