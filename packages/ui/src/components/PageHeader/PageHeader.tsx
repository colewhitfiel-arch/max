import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { ChevronLeftIcon } from '../../icons';
import { IconButton } from '../IconButton';
import './PageHeader.css';

export type PageHeaderVariant = 'solid' | 'plain';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Заголовок экрана (`<h1>`). */
  title: ReactNode;
  /** Подзаголовок. */
  subtitle?: ReactNode;
  /** Обработчик кнопки «Назад». Без него кнопка не показывается. */
  onBack?: () => void;
  /** Действия справа (IconButton, Button). */
  actions?: ReactNode;
  /**
   * `solid` — плашка на поверхности, заголовок слева (по умолчанию);
   * `plain` — без фона, заголовок по центру между «Назад» и действиями (как на главной из макета).
   */
  variant?: PageHeaderVariant;
  /** Прилипать к верху скролл-области (чат, длинные ленты); подложка растворяется в фон. */
  sticky?: boolean;
}

/** Шапка экрана: назад | заголовок/подзаголовок | действия. */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, subtitle, onBack, actions, variant = 'solid', sticky = false, className, ...rest },
  ref,
) {
  const plain = variant === 'plain';
  return (
    <header
      ref={ref}
      className={cx('ui-page-header', className)}
      data-variant={variant}
      data-sticky={sticky || undefined}
      {...rest}
    >
      {(onBack || plain) && (
        <div className="ui-page-header__lead">
          {onBack && (
            <IconButton className="ui-page-header__back" aria-label="Назад" onClick={onBack}>
              <ChevronLeftIcon />
            </IconButton>
          )}
        </div>
      )}
      <div className="ui-page-header__text">
        <h1 className="ui-page-header__title">{title}</h1>
        {subtitle != null && <div className="ui-page-header__subtitle">{subtitle}</div>}
      </div>
      {(actions != null || plain) && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
});
