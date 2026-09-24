import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Spinner } from '../Spinner';
import './Button.css';

/** `link` — текстовая кнопка без подложки («Подробнее» / «Скрыть»). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Визуальный вариант. По умолчанию `primary`. */
  variant?: ButtonVariant;
  /** Размер: sm 32px, md 44px, lg 52px. По умолчанию `md`. */
  size?: ButtonSize;
  /**
   * Состояние загрузки: спиннер, `aria-busy` и `aria-disabled` (не `disabled` — кнопка остаётся
   * в фокусе, скринридер не теряет её). Клик и отправка формы этой кнопкой гасятся.
   */
  loading?: boolean;
  /** Растянуть на всю ширину контейнера. */
  fullWidth?: boolean;
  /** Иконка слева от текста (при `loading` заменяется спиннером). */
  leftIcon?: ReactNode;
  /** Иконка справа от текста. */
  rightIcon?: ReactNode;
  /** Подчеркнуть текст (для `variant="link"`: «Скрыть» в раскрытом блоке). */
  underline?: boolean;
}

/** Кнопка. `type` по умолчанию `button`, чтобы не сабмитить формы случайно. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    underline = false,
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
    // Загрузка: кнопка фокусируема, но нажатие (и submit формы, в т.ч. Enter в поле) — нет.
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
      className={cx('ui-button', className)}
      data-variant={variant}
      data-size={size}
      data-full-width={fullWidth || undefined}
      data-underline={underline || undefined}
      data-loading={loading || undefined}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" className="ui-button__icon" aria-hidden="true" />
      ) : leftIcon ? (
        <span className="ui-button__icon">{leftIcon}</span>
      ) : null}
      {children != null && <span className="ui-button__label">{children}</span>}
      {rightIcon ? <span className="ui-button__icon">{rightIcon}</span> : null}
    </button>
  );
});
