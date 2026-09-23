import { forwardRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { HeartShapeIcon } from '../../icons';
import { cx } from '../../lib/cx';
import { getInitials } from '../Avatar';
import './HeartAvatar.css';

export type HeartAvatarTone = 'primary' | 'accent' | 'plain';

export interface HeartAvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Ширина бокса в px (сердце квадратное по ширине). По умолчанию 112. */
  size?: number;
  /**
   * Цвет сердца: `primary` — `--ui-color-accent-1` (выбранный ребёнок), `accent` —
   * `--ui-color-accent-2` (соседние), `plain` — белое. По умолчанию `primary`.
   */
  tone?: HeartAvatarTone;
  /** Фото. При ошибке загрузки или без него — инициалы. */
  src?: string | null;
  /** Имя: доступное название (`role="img"`) и инициалы. */
  name: string;
  /** Вместо фото — плюс («добавить ребёнка»); обычно вместе с `tone="plain"`. */
  add?: boolean;
}

/**
 * Аватар в сердце из макета родителя: круглое фото (60% ширины) по центру сердца.
 * Масштабируется целиком от `size`; цвет сердца — токенами, см. `tone`.
 */
export const HeartAvatar = forwardRef<HTMLSpanElement, HeartAvatarProps>(function HeartAvatar(
  { size = 112, tone = 'primary', src, name, add = false, className, style, ...rest },
  ref,
) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const vars = { '--ui-heart-avatar-size': `${size}px` } as CSSProperties;
  return (
    <span
      ref={ref}
      className={cx('ui-heart-avatar', className)}
      data-tone={tone}
      data-add={add || undefined}
      role="img"
      aria-label={name}
      style={{ ...vars, ...style }}
      {...rest}
    >
      <HeartShapeIcon className="ui-heart-avatar__shape" size="100%" />
      {add ? (
        <span className="ui-heart-avatar__plus" aria-hidden="true" />
      ) : (
        <span className="ui-heart-avatar__photo" aria-hidden="true">
          {showImage ? (
            <img
              className="ui-heart-avatar__image"
              src={src ?? undefined}
              alt=""
              draggable={false}
              onError={() => setFailed(src ?? null)}
            />
          ) : (
            <span className="ui-heart-avatar__initials">{getInitials(name)}</span>
          )}
        </span>
      )}
    </span>
  );
});
