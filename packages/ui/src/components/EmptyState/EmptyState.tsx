import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { InboxIcon } from '../../icons';
import './EmptyState.css';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Иконка. По умолчанию — «пустой ящик». */
  icon?: ReactNode;
  /** Заголовок. */
  title: ReactNode;
  /** Пояснение. */
  description?: ReactNode;
  /** Действие (обычно `Button`). */
  action?: ReactNode;
}

/** Пустое состояние списка/экрана. */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('ui-empty-state', className)} {...rest}>
      <div className="ui-empty-state__icon">{icon ?? <InboxIcon size={40} />}</div>
      <div className="ui-empty-state__title">{title}</div>
      {description != null && <div className="ui-empty-state__description">{description}</div>}
      {action != null && <div className="ui-empty-state__action">{action}</div>}
    </div>
  );
});
