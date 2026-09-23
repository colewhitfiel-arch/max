import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './BottomNavigation.css';

export interface BottomNavigationItem {
  /** Уникальный ключ пункта. */
  key: string;
  /** Подпись (визуально скрыта, остаётся доступным именем пункта). */
  label: ReactNode;
  /** Иконка. */
  icon?: ReactNode;
  /** Ссылка: пункт рендерится как `<a>`, иначе — `<button>`. */
  href?: string;
  /** Активный пункт (`aria-current="page"`). */
  active?: boolean;
  /** Индикатор (число или точка) поверх иконки. */
  badge?: ReactNode;
  /** Акцентный пункт: крупный круг цвета primary (обычно центральный). */
  prominent?: boolean;
  /** Размер иконки: md 36px, lg 40px — для «лёгких» глифов, чтобы совпадали по массе с соседями. */
  iconSize?: 'md' | 'lg';
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

/** Нижнее меню-«пилюля»: `<nav>` с пунктами-иконками, активный помечен `aria-current`. */
export const BottomNavigation = forwardRef<HTMLElement, BottomNavigationProps>(
  function BottomNavigation({ items, onSelect, className, 'aria-label': ariaLabel, ...rest }, ref) {
    return (
      <nav
        ref={ref}
        className={cx('ui-bottom-nav', className)}
        {...rest}
        aria-label={ariaLabel ?? 'Основная навигация'}
      >
        <ul className="ui-bottom-nav__list">
          {items.map((item) => {
            const content = (
              <>
                <span className="ui-bottom-nav__icon" data-size={item.iconSize}>
                  {item.icon}
                  {item.badge != null && <span className="ui-bottom-nav__badge">{item.badge}</span>}
                </span>
                <span className="ui-bottom-nav__label ui-visually-hidden">{item.label}</span>
              </>
            );
            // Строковая подпись — ещё и явное имя с тултипом; при бейдже имя остаётся из
            // содержимого, чтобы число («3») не потерялось.
            const text = typeof item.label === 'string' ? item.label : undefined;
            const shared = {
              className: 'ui-bottom-nav__item',
              'aria-label': item.badge == null ? text : undefined,
              title: text,
              'aria-current': item.active ? ('page' as const) : undefined,
              'data-active': item.active || undefined,
              'data-prominent': item.prominent || undefined,
              onClick: (event: MouseEvent<HTMLElement>) => onSelect?.(item.key, event),
            };
            return (
              <li
                key={item.key}
                className="ui-bottom-nav__cell"
                data-prominent={item.prominent || undefined}
              >
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
