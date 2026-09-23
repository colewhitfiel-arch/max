import { createElement, forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Band.css';

export interface BandProps extends HTMLAttributes<HTMLElement> {
  /** На всю ширину экрана: выходит за боковые отступы `Screen`. По умолчанию `true`. */
  bleed?: boolean;
  /** HTML-тег. По умолчанию `div` (для самостоятельного блока с заголовком — `section`). */
  as?: ElementType;
}

/**
 * Полупрозрачная горизонтальная полоса-секция (блоки кружков в аналитике, задания в
 * подробностях): фон поверхности на 50%, вертикальный отступ 12px, горизонтальный — как
 * у экрана, так что содержимое остаётся на одной линии с остальным контентом.
 */
export const Band = forwardRef<HTMLElement, BandProps>(function Band(
  { bleed = true, as = 'div', className, ...rest },
  ref,
) {
  return createElement(as, {
    ref,
    className: cx('ui-band', className),
    'data-bleed': bleed || undefined,
    ...rest,
  });
});
