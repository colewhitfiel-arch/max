import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './IllustrationRow.css';

export interface IllustrationRowItem {
  key: string;
  /** Картинка с прозрачностью (png/svg), обрезанная по содержимому. */
  src: string;
  /** Альтернативный текст; пустой — картинка декоративная. */
  alt?: string;
}

export interface IllustrationRowProps extends HTMLAttributes<HTMLDivElement> {
  items: IllustrationRowItem[];
  /** Приглушить (серые полупрозрачные картинки — «не сегодня»). */
  muted?: boolean;
  /**
   * Гибкая высота: в родителе-flex ряд занимает свободное место (не больше 259px) и сжимается
   * вплоть до нуля, картинки уменьшаются вместе с ним. Для экрана без скролла (`Screen fit`).
   */
  fluid?: boolean;
}

/**
 * Иллюстрации в ряд по центру, стоят на общей линии и чуть заходят друг на друга:
 * одна — крупно, две — рядом (как робот и шахматы в макете), три и больше — мельче,
 * а если не влезают, ряд листается пальцем и следующая выглядывает из-за края.
 * Высота области постоянная (259px, как в макете), поэтому экран не прыгает.
 */
export const IllustrationRow = forwardRef<HTMLDivElement, IllustrationRowProps>(
  function IllustrationRow({ items, muted = false, fluid = false, className, ...rest }, ref) {
    const size = items.length <= 1 ? 'one' : items.length === 2 ? 'two' : 'many';
    return (
      <div
        ref={ref}
        className={cx('ui-illustration-row', className)}
        data-size={size}
        data-muted={muted || undefined}
        data-fluid={fluid || undefined}
        {...rest}
      >
        <div className="ui-illustration-row__track">
          {items.map((item) => (
            <img
              key={item.key}
              className="ui-illustration-row__item"
              src={item.src}
              alt={item.alt ?? ''}
              draggable={false}
              decoding="async"
            />
          ))}
        </div>
      </div>
    );
  },
);
