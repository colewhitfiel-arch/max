import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Spinner } from '../Spinner';
import type { ButtonSize, ButtonVariant } from '../Button';
import './IconButton.css';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** Обязательное доступное название — у кнопки нет текста. */
  'aria-label': string;
  /** Иконка. */
  children: ReactNode;
  /** Визуальный вариант. По умолчанию `ghost`. */
  variant?: ButtonVariant;
  /** Размер: sm 32px, md 44px, lg 52px. По умолчанию `md`. */
  size?: ButtonSize;
  /**
   * Состояние загрузки: спиннер вместо иконки, `aria-busy` и `aria-disabled` (кнопка остаётся
   * в фокусе); нажатие гасится.
   */
  loading?: boolean;
}

/** Квадратная кнопка с иконкой. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled,
    type = 'button',
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const busy = loading && !disabled;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-icon-button', className)}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner size="sm" aria-hidden="true" /> : children}
    </button>
  );
});
