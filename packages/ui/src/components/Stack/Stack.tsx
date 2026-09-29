import { createElement, forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Stack.css';

/** Шаг сетки 4px: 0 → 0, 1 → 4px, … 8 → 32px. */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type FlexAlign = 'stretch' | 'start' | 'center' | 'end' | 'baseline';
export type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around';

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Расстояние между детьми в шагах сетки. По умолчанию 3 (12px). */
  gap?: Space;
  /** align-items. По умолчанию `stretch`. */
  align?: FlexAlign;
  /** justify-content. */
  justify?: FlexJustify;
  /** Занимать свободное место родителя-flex (`flex: 1`). */
  grow?: boolean;
  /**
   * Прокручивать содержимое самому (`min-height: 0; overflow-y: auto`). В `Screen fit` —
   * сжиматься, когда места не хватает; в `Screen fixed` — занимать свободное место экрана.
   */
  scroll?: boolean;
  /** HTML-тег. По умолчанию `div`. */
  as?: ElementType;
}

/** Вертикальная flex-раскладка с gap из токенов. */
export const Stack = forwardRef<HTMLElement, StackProps>(function Stack(
  { gap = 3, align, justify, grow = false, scroll = false, as = 'div', className, ...rest },
  ref,
) {
  return createElement(as, {
    ref,
    className: cx('ui-stack', className),
    'data-gap': gap,
    'data-grow': grow || undefined,
    'data-scroll': scroll || undefined,
    'data-align': align,
    'data-justify': justify,
    ...rest,
  });
});
