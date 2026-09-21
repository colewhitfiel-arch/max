import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './IconTile.css';

export type IconTileSize = 'sm' | 'md' | 'lg' | 'xl';

export interface IconTileProps extends HTMLAttributes<HTMLSpanElement> {
  /** Окраска подложки и иконки. По умолчанию `neutral`. */
  tone?: Tone;
  /** Размер: sm 28, md 36, lg 48, xl 72 px. По умолчанию `md`. */
  size?: IconTileSize;
  /** Иконка. */
  children: ReactNode;
}

/** Иконка на скруглённой подложке — слот `left` у `ListRow`, маркер секции карточки. */
export const IconTile = forwardRef<HTMLSpanElement, IconTileProps>(function IconTile(
  { tone = 'neutral', size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx('ui-icon-tile', className)}
      data-tone={tone}
      data-size={size}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    >
      {children}
    </span>
  );
});
