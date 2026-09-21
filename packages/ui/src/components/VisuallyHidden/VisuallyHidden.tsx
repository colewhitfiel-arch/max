import { createElement, forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
  /** HTML-тег. По умолчанию `span`. */
  as?: ElementType;
}

/**
 * Текст только для скринридеров: заголовок экрана без визуальной шапки, подписи иконок.
 * Класс `.ui-visually-hidden` объявлен в styles/base.css.
 */
export const VisuallyHidden = forwardRef<HTMLElement, VisuallyHiddenProps>(function VisuallyHidden(
  { as = 'span', className, ...rest },
  ref,
) {
  return createElement(as, { ref, className: cx('ui-visually-hidden', className), ...rest });
});
