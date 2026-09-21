import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import type { Space } from '../Stack';
import './Grid.css';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Число равных колонок. По умолчанию 2. */
  columns?: number;
  /** Расстояние между ячейками в шагах сетки. По умолчанию 3 (12px). */
  gap?: Space;
}

/** Сетка равных колонок (плитки статистики, карточки 2×2). */
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { columns = 2, gap = 3, className, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-grid', className)}
      data-gap={gap}
      style={{ '--ui-grid-columns': columns, ...style } as CSSProperties}
      {...rest}
    />
  );
});
