import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './StatTile.css';

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  /** Подпись метрики («Посещаемость»). */
  label: ReactNode;
  /** Значение («92%»). Форматирование — на стороне потребителя. */
  value: ReactNode;
  /** Пояснение под значением («за 30 дней»). */
  hint?: ReactNode;
  /** Окраска значения. По умолчанию `neutral` (обычный текст). */
  tone?: Tone;
  /** Иконка в правом верхнем углу. */
  icon?: ReactNode;
}

/** Плитка с одной метрикой для дашбордов. */
export const StatTile = forwardRef<HTMLDivElement, StatTileProps>(function StatTile(
  { label, value, hint, tone = 'neutral', icon, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('ui-stat-tile', className)} data-tone={tone} {...rest}>
      <div className="ui-stat-tile__head">
        <span className="ui-stat-tile__label">{label}</span>
        {icon != null && <span className="ui-stat-tile__icon">{icon}</span>}
      </div>
      <div className="ui-stat-tile__value">{value}</div>
      {hint != null && <div className="ui-stat-tile__hint">{hint}</div>}
    </div>
  );
});
