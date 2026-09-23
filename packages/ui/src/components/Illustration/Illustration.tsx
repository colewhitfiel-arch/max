import { forwardRef, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Illustration.css';

export interface IllustrationProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'children'
> {
  /** Картинка экрана (webp/png из макета). */
  src: string;
  /** Альтернативный текст. Без него картинка декоративная (`alt=""` и `aria-hidden`). */
  alt?: string;
  /** Пропорции области (`aspect-ratio`), картинка обрезается по ней. По умолчанию `342 / 256`. */
  ratio?: string;
}

/**
 * Крупная иллюстрация экрана (главная репетитора): на всю ширину контента, но не шире 342px,
 * по центру, заполняет область с заданными пропорциями (`object-fit: cover`).
 */
export const Illustration = forwardRef<HTMLImageElement, IllustrationProps>(function Illustration(
  { src, alt, ratio, className, style, ...rest },
  ref,
) {
  const decorative = !alt;
  return (
    <img
      ref={ref}
      className={cx('ui-illustration', className)}
      src={src}
      alt={alt ?? ''}
      aria-hidden={decorative || undefined}
      draggable={false}
      decoding="async"
      style={
        (ratio ? { '--ui-illustration-ratio': ratio, ...style } : style) as
          CSSProperties | undefined
      }
      {...rest}
    />
  );
});
