import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './AppLayout.css';

export interface AppLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Шапка (обычно `PageHeader`); прижата к верху, учитывает safe-area. */
  header?: ReactNode;
  /** Нижнее меню (обычно `BottomNavigation`); прижато к низу, учитывает safe-area. */
  bottomNav?: ReactNode;
  /** Содержимое — как правило `AppLayout.Content`. */
  children?: ReactNode;
}

export type AppLayoutContentProps = HTMLAttributes<HTMLElement>;

/** Скроллируемая область между шапкой и меню (`<main>`). */
const AppLayoutContent = forwardRef<HTMLElement, AppLayoutContentProps>(function AppLayoutContent(
  { className, ...rest },
  ref,
) {
  return <main ref={ref} className={cx('ui-app-layout__content', className)} {...rest} />;
});

const AppLayoutRoot = forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout(
  { header, bottomNav, className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('ui-app-layout', className)} {...rest}>
      {header != null && <div className="ui-app-layout__header">{header}</div>}
      {children}
      {bottomNav != null && <div className="ui-app-layout__nav">{bottomNav}</div>}
    </div>
  );
});

/**
 * Каркас приложения: шапка / скролл-контент / нижнее меню на всю высоту окна,
 * контент ограничен 640px по центру на широких экранах.
 */
export const AppLayout = Object.assign(AppLayoutRoot, { Content: AppLayoutContent });
