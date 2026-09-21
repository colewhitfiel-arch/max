import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import { VisuallyHidden } from '../VisuallyHidden';
import './WeekArc.css';

/** Окраска плашки дня: тона Badge + `muted` (приглушённая, «ещё не наступил»). */
export type WeekArcTone = Tone | 'muted';

export interface WeekArcItem {
  key: string;
  /** Короткая подпись на плашке («пн»). */
  label: ReactNode;
  tone: WeekArcTone;
  /** Полное описание для скринридера («понедельник — посещено»). По умолчанию `label`. */
  title?: string;
}

export interface WeekArcLegendItem {
  tone: WeekArcTone;
  label: ReactNode;
}

export interface WeekArcProps extends HTMLAttributes<HTMLDivElement> {
  /** Дни по порядку слева направо (обычно 7). */
  items: WeekArcItem[];
  /** Легенда тонов слева от дуги. */
  legend?: WeekArcLegendItem[];
  /** Доступное название всей дуги («Посещения за неделю»). */
  'aria-label'?: string;
}

/* Геометрия из макета: контейнер 213px, плашки 34×38 на окружности r=89,
 * от −81° до +81° (0° — вверх), каждая повёрнута к центру. */
const VIEW_W = 213;
const VIEW_H = 118;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = 110;
const RADIUS = 89;
const CHIP_W = 34;
const CHIP_H = 38;
const CHIP_R = 8;
const MAX_ANGLE = 81;

function chipTransform(index: number, count: number): string {
  const step = count > 1 ? (MAX_ANGLE * 2) / (count - 1) : 0;
  const angle = count > 1 ? -MAX_ANGLE + step * index : 0;
  const rad = (angle * Math.PI) / 180;
  const x = CENTER_X + RADIUS * Math.sin(rad);
  const y = CENTER_Y - RADIUS * Math.cos(rad);
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})`;
}

/**
 * Дуга дней недели: плашки с подписями по окружности + легенда тонов.
 * Домена не знает: что означают тона, решает потребитель.
 */
export const WeekArc = forwardRef<HTMLDivElement, WeekArcProps>(function WeekArc(
  { items, legend, className, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('ui-week-arc', className)} {...rest}>
      {legend && legend.length > 0 && (
        <ul className="ui-week-arc__legend">
          {legend.map((entry, index) => (
            <li key={index} className="ui-week-arc__legend-item">
              <span className="ui-week-arc__swatch" data-tone={entry.tone} aria-hidden="true" />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
      <div className="ui-week-arc__figure">
        <svg
          className="ui-week-arc__svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          aria-hidden="true"
          focusable="false"
        >
          {items.map((item, index) => (
            <g
              key={item.key}
              className="ui-week-arc__chip"
              data-tone={item.tone}
              transform={chipTransform(index, items.length)}
            >
              <rect
                x={-CHIP_W / 2}
                y={-CHIP_H / 2}
                width={CHIP_W}
                height={CHIP_H}
                rx={CHIP_R}
                className="ui-week-arc__chip-bg"
              />
              <text
                className="ui-week-arc__chip-label"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {item.label}
              </text>
            </g>
          ))}
        </svg>
        <VisuallyHidden as="ul" aria-label={ariaLabel}>
          {items.map((item) => (
            <li key={item.key}>{item.title ?? item.label}</li>
          ))}
        </VisuallyHidden>
      </div>
    </div>
  );
});
