import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { axisTicks, finite, ratio, round2 } from '../../lib/chart';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './BarChart.css';

/** Цвет столбца и его строки в легенде: акцент или смысловой тон. */
export type BarChartTone = 'primary' | Tone;

export interface BarChartSegment {
  key: string;
  /** Величина части столбца (≥ 0). Нулевые части не рисуются. */
  value: number;
  /** Приглушённая часть — тот же цвет темнее («пропустили»). */
  dim?: boolean;
}

export interface BarChartBar {
  key: string;
  /** Подпись под столбцом (код группы «001»). */
  label?: ReactNode;
  tone: BarChartTone;
  /** Части столбца снизу вверх («посетили», затем «пропустили»). */
  segments: BarChartSegment[];
  /** Число над столбцом. По умолчанию — сумма частей. */
  total?: ReactNode;
}

export interface BarChartLegendItem {
  /** Квадрат приглушённого цвета (как у `dim`-части столбца). */
  dim?: boolean;
  label: ReactNode;
}

export interface BarChartLegendGroup {
  key: string;
  /** Название группы легенды (курс «Робототехника»). */
  title: ReactNode;
  tone: BarChartTone;
  items: BarChartLegendItem[];
}

export interface BarChartProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'aria-label' | 'title'
> {
  /** Столбцы слева направо (по центру области). */
  bars: BarChartBar[];
  /**
   * Деления оси Y (линии сетки с подписями). По умолчанию — 0, половина и максимум столбцов,
   * округлённый вверх до десятка (19 → 0 / 10 / 20).
   */
  yTicks?: number[];
  /** Подпись деления оси Y. По умолчанию — число как есть. */
  formatTick?: (value: number) => string;
  /** Легенда слева: группы с названием и строками «квадрат + подпись». */
  legend?: BarChartLegendGroup[];
  /** Заголовок карточки по центру сверху («Посещения»). */
  title?: ReactNode;
  /**
   * Доступное название диаграммы (`role="img"`): перечисли значения
   * («Группа 001: посетили 15, пропустили 4; группа 003: …»).
   */
  'aria-label': string;
}

/** Верх оси по умолчанию: максимум, округлённый вверх до десятка (не меньше 10). */
function tensCeil(value: number): number {
  return Math.max(10, Math.ceil(value / 10) * 10);
}

/**
 * Карточка «Посещения» из макета успеваемости репетитора: легенда по курсам слева, справа
 * составные столбцы 28px со скруглённым верхом (снизу «посетили» цветом курса, сверху
 * «пропустили» — тем же цветом темнее), итог над столбцом, подпись под ним, сетка по делениям.
 * Нулевой столбец — пустое место с подписью. Столбцы ужимаются до шага 22px (подпись не
 * слипается с соседней); если и так не помещаются — область прокручивается по горизонтали.
 */
export const BarChart = forwardRef<HTMLDivElement, BarChartProps>(function BarChart(
  { bars, yTicks, formatTick = String, legend, title, className, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const prepared = bars.map((bar) => {
    const segments = bar.segments
      .map((segment) => ({ ...segment, value: Math.max(0, finite(segment.value)) }))
      .filter((segment) => segment.value > 0);
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    return { bar, segments, total };
  });
  const maxTotal = Math.max(0, ...prepared.map((item) => item.total));
  const ticks = (yTicks ?? axisTicks(tensCeil(maxTotal)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const top = Math.max(maxTotal, ...ticks);
  const max = top > 0 ? top : 1;
  const percent = (value: number) => `${round2(ratio(value, 0, max) * 100)}%`;
  const hasLegend = legend !== undefined && legend.length > 0;
  const hasLabels = bars.some((bar) => bar.label != null && bar.label !== false);

  return (
    <div
      ref={ref}
      className={cx('ui-bar-chart', className)}
      data-legend={hasLegend || undefined}
      {...rest}
    >
      {title != null && title !== false && <div className="ui-bar-chart__title">{title}</div>}
      <div className="ui-bar-chart__body">
        {hasLegend && (
          <ul className="ui-bar-chart__legend">
            {legend.map((group) => (
              <li key={group.key} className="ui-bar-chart__legend-group" data-tone={group.tone}>
                <span className="ui-bar-chart__legend-title">{group.title}</span>
                <ul className="ui-bar-chart__legend-items">
                  {group.items.map((item, index) => (
                    <li key={index} className="ui-bar-chart__legend-item">
                      <span
                        className="ui-bar-chart__swatch"
                        data-dim={item.dim || undefined}
                        aria-hidden="true"
                      />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <div
          className="ui-bar-chart__figure"
          role="img"
          aria-label={ariaLabel}
          data-labels={hasLabels || undefined}
        >
          <div
            className="ui-bar-chart__plot"
            style={{ '--ui-bar-chart-count': bars.length } as CSSProperties}
          >
            {ticks.map((tick, index) => (
              <div
                key={index}
                className="ui-bar-chart__tick"
                style={{ '--ui-bar-chart-at': percent(tick) } as CSSProperties}
              >
                <span className="ui-bar-chart__tick-label">{formatTick(tick)}</span>
              </div>
            ))}
            <div className="ui-bar-chart__bars">
              {prepared.map(({ bar, segments, total }) => {
                // Каждая часть — прямоугольник от основания до своей верхней границы со
                // скруглённым верхом; нижние рисуются поверх верхних (как в макете).
                let cursor = 0;
                const layers = segments.map((segment) => {
                  cursor += segment.value;
                  return { segment, top: cursor };
                });
                return (
                  <div
                    key={bar.key}
                    className="ui-bar-chart__bar"
                    data-tone={bar.tone}
                    data-empty={total === 0 || undefined}
                  >
                    {layers.reverse().map(({ segment, top: layerTop }) => (
                      <span
                        key={segment.key}
                        className="ui-bar-chart__segment"
                        data-dim={segment.dim || undefined}
                        style={{ '--ui-bar-chart-h': percent(layerTop) } as CSSProperties}
                      />
                    ))}
                    <span
                      className="ui-bar-chart__total"
                      style={{ '--ui-bar-chart-h': percent(total) } as CSSProperties}
                    >
                      {bar.total ?? total}
                    </span>
                    {bar.label != null && bar.label !== false && (
                      <span className="ui-bar-chart__label">{bar.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
