import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { AlertIcon } from '../../icons';
import { Button } from '../Button';
import './ErrorState.css';

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Заголовок. По умолчанию «Не удалось загрузить». */
  title?: ReactNode;
  /** Пояснение (текст ошибки, подготовленный потребителем). */
  description?: ReactNode;
  /** Обработчик кнопки «Повторить». Без него кнопка не показывается. */
  onRetry?: () => void;
  /** Текст кнопки. По умолчанию «Повторить». */
  retryLabel?: string;
  /** Иконка. По умолчанию — предупреждение. */
  icon?: ReactNode;
}

/** Состояние ошибки экрана/блока с кнопкой повтора. `role="alert"`. */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  {
    title = 'Не удалось загрузить',
    description,
    onRetry,
    retryLabel = 'Повторить',
    icon,
    className,
    ...rest
  },
  ref,
) {
  return (
    <div ref={ref} className={cx('ui-error-state', className)} role="alert" {...rest}>
      <div className="ui-error-state__icon">{icon ?? <AlertIcon size={40} />}</div>
      <div className="ui-error-state__title">{title}</div>
      {description != null && <div className="ui-error-state__description">{description}</div>}
      {onRetry && (
        <div className="ui-error-state__action">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
});
