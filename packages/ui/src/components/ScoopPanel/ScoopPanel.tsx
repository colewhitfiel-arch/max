import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './ScoopPanel.css';

export interface ScoopPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Вытянуть на боковые поля `Screen` (16px) — панель на всю ширину экрана. По умолчанию `true`. */
  bleed?: boolean;
  /** Занять свободную высоту родителя (для `Screen fill`): фон тянется до низа экрана. */
  grow?: boolean;
}

/**
 * Панель с вогнутым верхним краем из макета главной родителя (фигура «Union»): края
 * поднимаются к углам, середина ровная — панель «подхватывает» ленту сердец над ней.
 * Кривая масштабируется по ширине; контент начинается под ровной серединой с обычными полями.
 */
export const ScoopPanel = forwardRef<HTMLDivElement, ScoopPanelProps>(function ScoopPanel(
  { bleed = true, grow = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-scoop-panel', className)}
      data-bleed={bleed || undefined}
      data-grow={grow || undefined}
      {...rest}
    >
      {/* Фон одним слоем с общей прозрачностью: шапка-кривая и тело не дают шва на стыке. */}
      <div className="ui-scoop-panel__backdrop" aria-hidden="true">
        <svg
          className="ui-scoop-panel__cap"
          viewBox="0 0 402 52"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 0C0 0 31.4323 43 116 52H286C370.568 43 402 0 402 0V53H0Z" />
        </svg>
        <div className="ui-scoop-panel__fill" />
      </div>
      <div className="ui-scoop-panel__body">{children}</div>
    </div>
  );
});
