import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './PieChart.css';

export interface PieChartSlice {
  key: string;
  /** Величина сектора (≥ 0). Нулевые и отрицательные секторы не рисуются. */
  value: number;
  tone: Tone;
  /** Выдвинуть сектор наружу по биссектрисе (акцент, как «Правильно» в макете). */
  explode?: boolean;
  /** Текст внутри сектора. По умолчанию — `value`. */
  label?: ReactNode;
}

export interface PieChartLegendItem {
  tone: Tone;
  label: ReactNode;
}

export interface PieChartProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> {
  /** Секторы по часовой стрелке, первый начинается «на 12 часов». */
  slices: PieChartSlice[];
  /** Диаметр круга в px (без учёта выдвинутых секторов). По умолчанию 134. */
  size?: number;
  /** Легенда слева от диаграммы. */
  legend?: PieChartLegendItem[];
  /**
   * Доступное название диаграммы (`role="img"`). Картинка для скринридера непрозрачна —
   * перечисли в названии сами значения («Правильно 25, неправильно 30, предстоят 45»).
   */
  'aria-label': string;
}

/* Макет: круг 134px, выдвинутый сектор смещён на ~8px, числа 16px внутри секторов. */
const EXPLODE_OFFSET = 8;
/** Узкие секторы: подпись дальше от центра, где сектор шире. */
const NARROW_SWEEP = 100;
/** Совсем узкий сектор число не вмещает — оно остаётся только в `aria-label`. */
const MIN_LABEL_SWEEP = 16;
/** Толщина кольца-заглушки, когда все значения нулевые. */
const EMPTY_RING = 12;

/** Точка на окружности: угол в градусах по часовой от «12 часов». */
function polar(radius: number, angle: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [radius * Math.sin(rad), -radius * Math.cos(rad)];
}

function sectorPath(radius: number, start: number, end: number): string {
  const [x0, y0] = polar(radius, start);
  const [x1, y1] = polar(radius, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

/**
 * Круговая диаграмма на SVG: числа внутри секторов, выдвинутые секторы, легенда списком.
 * Все значения нулевые — нейтральное кольцо. Домена не знает: смысл тонов задаёт потребитель.
 */
export const PieChart = forwardRef<HTMLDivElement, PieChartProps>(function PieChart(
  { slices, size = 134, legend, className, style, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const radius = size / 2;
  const box = size + EXPLODE_OFFSET * 2;
  const visible = slices
    .map((slice) => ({ ...slice, value: Number.isFinite(slice.value) ? slice.value : 0 }))
    .filter((slice) => slice.value > 0);
  const total = visible.reduce((sum, slice) => sum + slice.value, 0);
  const single = visible.length === 1;

  let cursor = 0;
  const sectors = visible.map((slice) => {
    const sweep = (slice.value / total) * 360;
    const start = cursor;
    cursor += sweep;
    const middle = start + sweep / 2;
    const [dx, dy] = slice.explode && !single ? polar(EXPLODE_OFFSET, middle) : [0, 0];
    const labelRadius = single ? 0 : radius * (sweep < NARROW_SWEEP ? 0.65 : 0.52);
    const [lx, ly] = polar(labelRadius, middle);
    return { slice, start, end: start + sweep, sweep, dx, dy, lx, ly };
  });

  return (
    <div
      ref={ref}
      className={cx('ui-pie-chart', className)}
      data-legend={legend && legend.length > 0 ? true : undefined}
      data-empty={total === 0 || undefined}
      style={{ '--ui-pie-chart-box': `${box}px`, ...style } as CSSProperties}
      {...rest}
    >
      {legend && legend.length > 0 && (
        <ul className="ui-pie-chart__legend">
          {legend.map((entry, index) => (
            <li key={index} className="ui-pie-chart__legend-item">
              <span className="ui-pie-chart__swatch" data-tone={entry.tone} aria-hidden="true" />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
      <div className="ui-pie-chart__figure" role="img" aria-label={ariaLabel}>
        <svg
          className="ui-pie-chart__svg"
          viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
          aria-hidden="true"
          focusable="false"
        >
          {total === 0 ? (
            <circle
              className="ui-pie-chart__empty"
              r={radius - EMPTY_RING / 2}
              strokeWidth={EMPTY_RING}
            />
          ) : (
            sectors.map(({ slice, start, end, sweep, dx, dy, lx, ly }) => (
              <g
                key={slice.key}
                className="ui-pie-chart__slice"
                data-tone={slice.tone}
                data-explode={(slice.explode && !single) || undefined}
                transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}
              >
                {single ? (
                  <circle className="ui-pie-chart__sector" r={radius} />
                ) : (
                  <path className="ui-pie-chart__sector" d={sectorPath(radius, start, end)} />
                )}
                {sweep >= MIN_LABEL_SWEEP && (
                  <text
                    className="ui-pie-chart__value"
                    x={lx.toFixed(2)}
                    y={ly.toFixed(2)}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {slice.label ?? slice.value}
                  </text>
                )}
              </g>
            ))
          )}
        </svg>
      </div>
    </div>
  );
});
