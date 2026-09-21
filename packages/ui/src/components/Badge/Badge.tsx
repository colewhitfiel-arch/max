import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './Badge.css';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Смысловая окраска. По умолчанию `neutral`. */
  tone?: Tone;
  /** Точка-индикатор слева от текста. */
  dot?: boolean;
}

/** Небольшая статусная метка. Не интерактивна (для выбора есть `Chip`). */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx('ui-badge', className)} data-tone={tone} {...rest}>
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
});
