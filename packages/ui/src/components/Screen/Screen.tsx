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
   * Занять свободное место родителя-flex (`flex: 1`), как `Stack grow`: экран под своей шапкой
   * внутри `Screen fill` — вместе ровно в высоту области, без лишней прокрутки на высоту шапки.
   */
  grow?: boolean;
  /**
   * Ровно высота скролл-области (`height: 100%`): экран не прокручивается сам — прокручиваются
   * его части (панель с `ScoopPanel scroll`). Не влезло и так (очень низкое окно) — прокрутится
   * вся область, как обычно.
   */
  fit?: boolean;
}

/**
 * Обёртка содержимого экрана: отступы + вертикальная раскладка.
 * Состояния (loading/error/empty) решает потребитель через Skeleton/ErrorState/EmptyState.
 */
export const Screen = forwardRef<HTMLDivElement, ScreenProps>(function Screen(
  { padding = 'md', gap = 4, fill = false, grow = false, fit = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-screen', className)}
      data-padding={padding}
      data-gap={gap}
      data-fill={fill || undefined}
      data-grow={grow || undefined}
      data-fit={fit || undefined}
      {...rest}
    />
  );
});
