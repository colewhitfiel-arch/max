import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Skeleton.css';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** Ширина (px или CSS-длина). По умолчанию 100%. */
  width?: number | string;
  /** Высота (px или CSS-длина). По умолчанию 16px. */
  height?: number | string;
  /** Круг (для аватаров). */
  round?: boolean;
}

/** Плейсхолдер загрузки. Скрыт от скринридеров — статус загрузки объявляй отдельно. */
export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(
  { width, height, round = false, className, style, ...rest },
  ref,
) {
  const inlineStyle: CSSProperties = { ...style };
  if (width != null) inlineStyle.width = width;
  if (height != null) inlineStyle.height = height;
  return (
    <span
      ref={ref}
      className={cx('ui-skeleton', className)}
      data-round={round || undefined}
      style={inlineStyle}
      aria-hidden="true"
      {...rest}
    />
  );
});

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  /** Количество строк. По умолчанию 3; последняя короче. */
  lines?: number;
}

/** Несколько строк-плейсхолдеров текста. */
export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(function SkeletonText(
  { lines = 3, className, ...rest },
  ref,
) {
  const count = Math.max(1, Math.floor(lines));
  return (
    <div ref={ref} className={cx('ui-skeleton-text', className)} aria-hidden="true" {...rest}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width={index === count - 1 && count > 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
});
