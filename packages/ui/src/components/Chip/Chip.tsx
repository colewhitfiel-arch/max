import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './Chip.css';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Выбран (`aria-pressed`). */
  selected?: boolean;
  /** Иконка слева. */
  leftIcon?: ReactNode;
}

/** Выбираемая «таблетка» для фильтров и списков интересов. Это `<button>` с `aria-pressed`. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, leftIcon, type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-chip', className)}
      aria-pressed={selected}
      data-selected={selected || undefined}
      {...rest}
    >
      {leftIcon != null && <span className="ui-chip__icon">{leftIcon}</span>}
      <span className="ui-chip__label">{children}</span>
    </button>
  );
});
