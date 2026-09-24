import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './ProgressBar.css';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Текущее значение (0..max). */
  value: number;
  /** Максимум. По умолчанию 100. */
  max?: number;
  /** Окраска. По умолчанию `info` (primary). */
  tone?: Tone;
  /** Толщина: sm 4px, md 8px. По умолчанию `md`. */
  size?: 'sm' | 'md';
  /** Доступное название (`aria-label`). */
  label?: string;
}

/** Доля в [0, 1] с защитой от NaN и выхода за границы. */
export function clampRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Линейный прогресс (`role="progressbar"`). */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(function ProgressBar(
  { value, max = 100, tone = 'info', size = 'md', label, className, ...rest },
  ref,
) {
  const ratio = clampRatio(value, max);
  return (
    <div
      ref={ref}
      className={cx('ui-progress-bar', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0}
      aria-label={label}
      data-tone={tone}
      data-size={size}
      {...rest}
    >
      <div className="ui-progress-bar__fill" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
});
