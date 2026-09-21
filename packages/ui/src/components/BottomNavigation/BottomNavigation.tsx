import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './BottomNavigation.css';

export interface BottomNavigationItem {
  /** Уникальный ключ пункта. */
  key: string;
  /** Подпись. */
  label: ReactNode;
  /** Иконка. */
  icon?: ReactNode;
  /** Ссылка: пункт рендерится как `<a>`, иначе — `<button>`. */
  href?: string;
  /** Активный пункт (`aria-current="page"`). */
  active?: boolean;
  /** Индикатор (число или точка) поверх иконки. */
  badge?: ReactNode;
}

export interface BottomNavigationProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  /** Пункты меню (обычно 3–5). */
  items: BottomNavigationItem[];
  /**
   * Выбор пункта. Для SPA-роутера: не задавай `href` и навигируй здесь,
   * либо задай `href` и вызови `event.preventDefault()`.
   */
  onSelect?: (key: string, event: MouseEvent<HTMLElement>) => void;
}

/** Нижнее меню: `<nav>` с пунктами, активный помечен `aria-current`. */
export const BottomNavigation = forwardRef<HTMLElement, BottomNavigationProps>(
  function BottomNavigation({ items, onSelect, className, ...rest }, ref) {
    return (
      <nav
        ref={ref}
        className={cx('ui-bottom-nav', className)}
        aria-label={rest['aria-label'] ?? 'Основная навигация'}
        {...rest}
      >
        <ul className="ui-bottom-nav__list">
          {items.map((item) => {
            const content = (
              <>
                <span className="ui-bottom-nav__icon">
                  {item.icon}
                  {item.badge != null && <span className="ui-bottom-nav__badge">{item.badge}</span>}
                </span>
                <span className="ui-bottom-nav__label">{item.label}</span>
              </>
            );
            const shared = {
              className: 'ui-bottom-nav__item',
              'aria-current': item.active ? ('page' as const) : undefined,
              'data-active': item.active || undefined,
              onClick: (event: MouseEvent<HTMLElement>) => onSelect?.(item.key, event),
            };
            return (
              <li key={item.key} className="ui-bottom-nav__cell">
                {item.href ? (
                  <a href={item.href} {...shared}>
                    {content}
                  </a>
                ) : (
                  <button type="button" {...shared}>
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    );
  },
);
