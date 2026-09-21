import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Spinner.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Размер: sm 16px, md 24px, lg 32px. */
  size?: SpinnerSize;
  /** Доступное описание (`aria-label`). По умолчанию «Загрузка». */
  label?: string;
}

/** Индикатор загрузки. `role="status"`; чтобы сделать декоративным — передай `aria-hidden`. */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label = 'Загрузка', className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx('ui-spinner', className)}
      data-size={size}
      role="status"
      aria-label={label}
      {...rest}
    />
  );
});
