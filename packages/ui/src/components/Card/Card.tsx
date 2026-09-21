import { forwardRef, type HTMLAttributes, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import './Card.css';

export type CardPadding = 'none' | 'sm' | 'md';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Внутренний отступ: none 0, sm 12px, md 16px. По умолчанию `md`. */
  padding?: CardPadding;
  /**
   * Интерактивная карточка: `role="button"`, фокусируемая, Enter/Space вызывают `onClick`,
   * hover/active-состояния.
   */
  interactive?: boolean;
  /** Недоступна для нажатия (только для `interactive`). */
  disabled?: boolean;
}

/** Поверхность с рамкой и скруглением. Домена не знает — содержимое любое. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', interactive = false, disabled = false, className, onClick, onKeyDown, ...rest },
  ref,
) {
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
      className={cx('ui-card', className)}
      data-padding={padding}
      data-interactive={interactive || undefined}
      data-disabled={disabled || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
      onClick={interactive && disabled ? undefined : onClick}
      onKeyDown={interactive ? handleKeyDown : onKeyDown}
      {...rest}
    />
  );
});
