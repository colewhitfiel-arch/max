import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './Chip.css';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Выбран (`aria-pressed`). Передавай (в том числе `false`) только у переключателей — фильтров,
   * сегментов, пресетов. Без пропа чип — обычная кнопка (подсказка-стартер) без `aria-pressed`.
   */
  selected?: boolean;
  /** Иконка слева. */
  leftIcon?: ReactNode;
}

/**
 * «Таблетка» для фильтров, списков интересов и подсказок. Это `<button>`; `aria-pressed` —
 * только когда передан `selected`.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected, leftIcon, type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-chip', className)}
      aria-pressed={selected}
      data-selected={selected === true || undefined}
      {...rest}
    >
      {leftIcon != null && <span className="ui-chip__icon">{leftIcon}</span>}
      <span className="ui-chip__label">{children}</span>
    </button>
  );
});
