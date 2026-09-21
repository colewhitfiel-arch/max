import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { ChevronLeftIcon } from '../../icons';
import { IconButton } from '../IconButton';
import './PageHeader.css';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Заголовок экрана (`<h1>`). */
  title: ReactNode;
  /** Подзаголовок. */
  subtitle?: ReactNode;
  /** Обработчик кнопки «Назад». Без него кнопка не показывается. */
  onBack?: () => void;
  /** Действия справа (IconButton, Button). */
  actions?: ReactNode;
}

/** Шапка экрана: назад | заголовок/подзаголовок | действия. */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, subtitle, onBack, actions, className, ...rest },
  ref,
) {
  return (
    <header ref={ref} className={cx('ui-page-header', className)} {...rest}>
      {onBack && (
        <IconButton className="ui-page-header__back" aria-label="Назад" onClick={onBack}>
          <ChevronLeftIcon />
        </IconButton>
      )}
      <div className="ui-page-header__text">
        <h1 className="ui-page-header__title">{title}</h1>
        {subtitle != null && <div className="ui-page-header__subtitle">{subtitle}</div>}
      </div>
      {actions != null && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
});
