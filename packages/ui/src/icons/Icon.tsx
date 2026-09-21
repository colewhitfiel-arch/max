import { type SVGProps } from 'react';
import { cx } from '../lib/cx';
import './Icon.css';

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Размер в px (или любая CSS-длина). По умолчанию 24. */
  size?: number | string;
  /**
   * Доступное название. Если задано — иконка становится `role="img"`;
   * без него иконка декоративная (`aria-hidden`).
   */
  title?: string;
}

/**
 * Базовая обёртка для inline-SVG иконок: 24×24 viewBox, `currentColor`,
 * по умолчанию скрыта от скринридеров. Набор временный — заменится финальным.
 */
export function Icon({ size = 24, title, className, children, ...rest }: IconProps) {
  return (
    <svg
      className={cx('ui-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
