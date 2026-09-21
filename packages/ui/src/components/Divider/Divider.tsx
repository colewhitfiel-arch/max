import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Divider.css';

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  /** Ориентация. Вертикальная растягивается по высоте flex-контейнера. */
  orientation?: 'horizontal' | 'vertical';
}

/** Разделитель (`<hr>`). */
export const Divider = forwardRef<HTMLHRElement, DividerProps>(function Divider(
  { orientation = 'horizontal', className, ...rest },
  ref,
) {
  return (
    <hr
      ref={ref}
      className={cx('ui-divider', className)}
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
      data-orientation={orientation}
      {...rest}
    />
  );
});
