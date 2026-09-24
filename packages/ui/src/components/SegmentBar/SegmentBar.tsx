import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import { VisuallyHidden } from '../VisuallyHidden';
import './SegmentBar.css';

export interface SegmentBarSegment {
  key: string;
  /** Величина сегмента (≥ 0). Нулевые сегменты скрыты. */
  value: number;
  tone: Tone;
  /** Подпись для скринридера («Правильно») — читается перед числом. */
  label?: ReactNode;
}

export interface SegmentBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> {
  /** Сегменты слева направо. */
  segments: SegmentBarSegment[];
  /** Доступное название полосы («Домашние задания по робототехнике»). */
  'aria-label': string;
}

/**
 * Горизонтальная составная полоса 24px: ширины сегментов пропорциональны значениям
 * (но не уже числа), числа по центру, внешние концы скруглены. Нулевые сегменты скрыты,
 * все нулевые — пустая нейтральная полоса.
 */
export const SegmentBar = forwardRef<HTMLDivElement, SegmentBarProps>(function SegmentBar(
  { segments, className, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const visible = segments.filter((segment) => Number.isFinite(segment.value) && segment.value > 0);
  return (
    <div
      ref={ref}
      className={cx('ui-segment-bar', className)}
      role="list"
      aria-label={ariaLabel}
      data-empty={visible.length === 0 || undefined}
      {...rest}
    >
      {visible.map((segment) => (
        <div
          key={segment.key}
          role="listitem"
          className="ui-segment-bar__segment"
          data-tone={segment.tone}
          style={{ '--ui-segment-bar-grow': segment.value } as CSSProperties}
        >
          {segment.label != null && <VisuallyHidden>{segment.label}: </VisuallyHidden>}
          {segment.value}
        </div>
      ))}
    </div>
  );
});
