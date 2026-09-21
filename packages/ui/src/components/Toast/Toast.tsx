import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { CloseIcon } from '../../icons';
import type { Tone } from '../../types';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import './Toast.css';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Окраска. По умолчанию `neutral`. */
  tone?: Tone;
  /** Заголовок (основной текст). */
  title?: ReactNode;
  /** Пояснение. */
  description?: ReactNode;
  /** Действие («Отменить»). */
  action?: ToastAction;
  /** Закрытие крестиком. Без обработчика крестик не показывается. */
  onDismiss?: () => void;
}

/** Презентационный тост. Обычно показывается через `useToast()`, но можно рендерить и вручную. */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { tone = 'neutral', title, description, action, onDismiss, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('ui-toast', className)} data-tone={tone} {...rest}>
      <div className="ui-toast__body">
        {title != null && <div className="ui-toast__title">{title}</div>}
        {description != null && <div className="ui-toast__description">{description}</div>}
      </div>
      {action && (
        <Button className="ui-toast__action" variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <IconButton className="ui-toast__close" aria-label="Закрыть" size="sm" onClick={onDismiss}>
          <CloseIcon size={18} />
        </IconButton>
      )}
    </div>
  );
});
