import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import type { Space } from '../Stack';
import './Screen.css';

export interface ScreenProps extends HTMLAttributes<HTMLDivElement> {
  /** Внутренние отступы: none 0, sm 12px, md 16px. По умолчанию `md`. */
  padding?: 'none' | 'sm' | 'md';
  /** Расстояние между блоками экрана в шагах сетки. По умолчанию 4 (16px). */
  gap?: Space;
  /** Растянуть на всю высоту скролл-области (для экранов с прижатой к низу панелью). */
  fill?: boolean;
  /**
   * Вписать экран в высоту скролл-области без вертикального скролла: высота ровно 100%,
   * свободное место забирают гибкие дети (`IllustrationRow fluid`), а если не хватает —
   * сжимаются дети со `Stack scroll` (прокручиваются сами). Главная ученика.
   */
  fit?: boolean;
}

/**
 * Обёртка содержимого экрана: отступы + вертикальная раскладка.
 * Состояния (loading/error/empty) решает потребитель через Skeleton/ErrorState/EmptyState.
 */
export const Screen = forwardRef<HTMLDivElement, ScreenProps>(function Screen(
  { padding = 'md', gap = 4, fill = false, fit = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-screen', className)}
      data-padding={padding}
      data-gap={gap}
      data-fill={fill || undefined}
      data-fit={fit || undefined}
      {...rest}
    />
  );
});
