import { forwardRef, useState, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { UserIcon } from '../../icons';
import './Avatar.css';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** URL картинки. При ошибке загрузки показываются инициалы. */
  src?: string | null;
  /** Имя: используется для инициалов и `aria-label`. */
  name?: string;
  /** Размер: sm 28, md 40, lg 56, xl 80 px. По умолчанию `md`. */
  size?: AvatarSize;
  /** Акцентное кольцо цвета primary со свечением (герой профиля). */
  ring?: boolean;
}

/** Инициалы: первые буквы первых двух слов имени. */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/** Аватар: картинка → инициалы → иконка пользователя. */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, name, size = 'md', ring = false, className, ...rest },
  ref,
) {
  // Запоминаем, какой именно src не загрузился: новый src снова пробуем показать.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const initials = name ? getInitials(name) : '';

  return (
    <span
      ref={ref}
      className={cx('ui-avatar', className)}
      data-size={size}
      data-ring={ring || undefined}
      role={name ? 'img' : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      {...rest}
    >
      {showImage ? (
        <img
          className="ui-avatar__image"
          src={src ?? undefined}
          alt=""
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : initials ? (
        <span className="ui-avatar__initials" aria-hidden="true">
          {initials}
        </span>
      ) : (
        <UserIcon className="ui-avatar__fallback" />
      )}
    </span>
  );
});
