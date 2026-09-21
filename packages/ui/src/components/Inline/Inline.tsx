import { createElement, forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import type { FlexAlign, FlexJustify, Space } from '../Stack';
import './Inline.css';

export interface InlineProps extends HTMLAttributes<HTMLElement> {
  /** Расстояние между детьми в шагах сетки. По умолчанию 2 (8px). */
  gap?: Space;
  /** align-items. По умолчанию `center`. */
  align?: FlexAlign;
  /** justify-content. */
  justify?: FlexJustify;
  /** Переносить на новую строку. По умолчанию `true`. */
  wrap?: boolean;
  /** HTML-тег. По умолчанию `div`. */
  as?: ElementType;
}

/** Горизонтальная flex-раскладка с gap из токенов. */
export const Inline = forwardRef<HTMLElement, InlineProps>(function Inline(
  { gap = 2, align = 'center', justify, wrap = true, as = 'div', className, ...rest },
  ref,
) {
  return createElement(as, {
    ref,
    className: cx('ui-inline', className),
    'data-gap': gap,
    'data-align': align,
    'data-justify': justify,
    'data-wrap': wrap || undefined,
    ...rest,
  });
});
