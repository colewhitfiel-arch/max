import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import { clampRatio } from '../ProgressBar';
import './ProgressRing.css';

export interface ProgressRingProps extends HTMLAttributes<HTMLDivElement> {
  /** Текущее значение (0..max). */
  value: number;
  /** Максимум. По умолчанию 100. */
  max?: number;
  /** Диаметр в px. По умолчанию 56. */
  size?: number;
  /** Толщина линии в px. По умолчанию 5. */
  thickness?: number;
  /** Окраска. По умолчанию `info` (primary). */
  tone?: Tone;
  /** Доступное название (`aria-label`). */
  label?: string;
  /** Содержимое в центре (например, «75%»). */
  children?: ReactNode;
}

/** Круговой прогресс (`role="progressbar"`) на SVG. */
export const ProgressRing = forwardRef<HTMLDivElement, ProgressRingProps>(function ProgressRing(
  {
    value,
    max = 100,
    size = 56,
    thickness = 5,
    tone = 'info',
    label,
    className,
    children,
    ...rest
  },
  ref,
) {
  const ratio = clampRatio(value, max);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      ref={ref}
      className={cx('ui-progress-ring', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      aria-label={label}
      data-tone={tone}
      style={{ width: size, height: size }}
      {...rest}
    >
      <svg className="ui-progress-ring__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ui-progress-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
        />
        <circle
          className="ui-progress-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      {children != null && <span className="ui-progress-ring__label">{children}</span>}
    </div>
  );
});
