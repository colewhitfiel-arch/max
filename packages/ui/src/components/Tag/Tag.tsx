import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './Tag.css';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Окраска. По умолчанию `neutral`. */
  tone?: Tone;
  /** Иконка слева. */
  icon?: ReactNode;
}

/**
 * Неинтерактивная «таблетка» для перечислений (интересы, цели, сильные стороны).
 * Для выбираемых элементов есть `Chip`, для коротких статусов — `Badge`.
 */
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = 'neutral', icon, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx('ui-tag', className)} data-tone={tone} {...rest}>
      {icon != null && <span className="ui-tag__icon">{icon}</span>}
      <span className="ui-tag__label">{children}</span>
    </span>
  );
});
