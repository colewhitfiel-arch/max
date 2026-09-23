import {
  Children,
  forwardRef,
  isValidElement,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import './ProgressBubble.css';

export interface ProgressBubbleProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Диаметр круга, px. Изменение анимируется (круг плавно растёт или сжимается). */
  size: number;
  /** Подпись сверху («Шахматы»). */
  title: ReactNode;
  /** Картинка по центру (≈55% диаметра, png с прозрачностью). */
  image?: string;
  /** Крупное число снизу («28»). */
  value: ReactNode;
  /** Мелкий хвост после числа («/45*»). */
  suffix?: ReactNode;
  /**
   * Доступное название всего круга («Шахматы: 28 из 45 рекомендованных»). Если задано —
   * круг читается одной картинкой (`role="img"`), содержимое скрыто от скринридеров.
   */
  'aria-label'?: string;
}

/**
 * Круг прогресса из макета главной родителя: подпись сверху, картинка кружка в центре,
 * число с хвостом снизу. Всё внутри масштабируется от `size`, смена размера плавная.
 */
export const ProgressBubble = forwardRef<HTMLDivElement, ProgressBubbleProps>(
  function ProgressBubble(
    { size, title, image, value, suffix, 'aria-label': ariaLabel, className, style, ...rest },
    ref,
  ) {
    const vars = { '--ui-progress-bubble-size': `${size}px` } as CSSProperties;
    const hideContent = ariaLabel ? true : undefined;
    return (
      <div
        ref={ref}
        className={cx('ui-progress-bubble', className)}
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        style={{ ...vars, ...style }}
        {...rest}
      >
        <span className="ui-progress-bubble__title" aria-hidden={hideContent}>
          {title}
        </span>
        <span className="ui-progress-bubble__media" aria-hidden="true">
          {image && (
            <img
              className="ui-progress-bubble__image"
              src={image}
              alt=""
              draggable={false}
              decoding="async"
            />
          )}
        </span>
        <span className="ui-progress-bubble__value" aria-hidden={hideContent}>
          {value}
          {suffix != null && <span className="ui-progress-bubble__suffix">{suffix}</span>}
        </span>
      </div>
    );
  },
);

export interface ProgressBubbleGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Круги `ProgressBubble` по порядку. */
  children: ReactNode;
}

/**
 * Круги «змейкой» в две колонки: нечётные слева, чётные справа и ниже на полкруга
 * (в макете — на 48px), дальше строки переносятся. Один круг стоит по центру.
 */
export const ProgressBubbleGroup = forwardRef<HTMLDivElement, ProgressBubbleGroupProps>(
  function ProgressBubbleGroup({ children, className, ...rest }, ref) {
    const items = Children.toArray(children).filter(isValidElement);
    return (
      <div
        ref={ref}
        className={cx('ui-progress-bubble-group', className)}
        role="list"
        data-single={items.length === 1 || undefined}
        {...rest}
      >
        {items.map((child, index) => (
          <div key={child.key ?? index} className="ui-progress-bubble-group__item" role="listitem">
            {child}
          </div>
        ))}
      </div>
    );
  },
);
