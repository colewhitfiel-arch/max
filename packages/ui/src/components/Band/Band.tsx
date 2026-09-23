import { createElement, forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Band.css';

export type BandTone = 'default' | 'subtle';

export interface BandProps extends HTMLAttributes<HTMLElement> {
  /** На всю ширину экрана: выходит за боковые отступы `Screen`. По умолчанию `true`. */
  bleed?: boolean;
  /**
   * `default` — поверхность на 50%, отступы 12px. `subtle` — заголовок над полосами (курс над
   * заданиями, макет 65:283): поверхность на 30%, ниже (≈38px с заголовком `title`) и щель 1px
   * до следующей полосы, чтобы они не сливались.
   */
  tone?: BandTone;
  /** Вплотную к шапке экрана: снимает верхний отступ `Screen` (первая полоса экрана). */
  flush?: boolean;
  /** HTML-тег. По умолчанию `div` (для самостоятельного блока с заголовком — `section`). */
  as?: ElementType;
}

/**
 * Полупрозрачная горизонтальная полоса-секция (блоки кружков в аналитике, задания в
 * подробностях): фон поверхности на 50%, вертикальный отступ 12px, горизонтальный — как
 * у экрана, так что содержимое остаётся на одной линии с остальным контентом.
 */
export const Band = forwardRef<HTMLElement, BandProps>(function Band(
  { bleed = true, tone = 'default', flush = false, as = 'div', className, ...rest },
  ref,
) {
  return createElement(as, {
    ref,
    className: cx('ui-band', className),
    'data-bleed': bleed || undefined,
    'data-tone': tone === 'default' ? undefined : tone,
    'data-flush': flush || undefined,
    ...rest,
  });
});
