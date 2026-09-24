import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { axisTicks, finite, niceWholeCeil, ratio, round2 } from '../../lib/chart';
import { cx } from '../../lib/cx';
import './LineChart.css';

export interface LineChartPoint {
  key: string;
  /** Значение точки. Точки идут по оси X равномерно, в порядке массива. */
  value: number;
}

export interface LineChartProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'aria-label' | 'title'
> {
  /** Точки слева направо (равномерно по оси X). Пусто или одна точка — ровная линия. */
  points: LineChartPoint[];
  /** Подписи оси X — равномерно по ширине линии (первая — у начала, последняя — у конца). */
  xLabels?: ReactNode[];
  /**
   * Деления оси Y (линии сетки с подписями). По умолчанию — 0, середина и «круглый» верх
   * над максимумом, все целые (6700 → 0 / 5000 / 10000, 1 → 0 / 1 / 2, 5 → 0 / 5 / 10).
   * Отрицательные значения авто-шкала не подписывает — для них передай свои деления.
   */
  yTicks?: number[];
  /** Подпись деления оси Y. По умолчанию — число как есть. */
  formatTick?: (value: number) => string;
  /** Ступенчатая линия: значение держится до следующей точки (баланс), как в макете. */
  step?: boolean;
  /** Заголовок карточки по центру сверху («Изменение баланса»). */
  title?: ReactNode;
  /** Высота карточки в px. По умолчанию 111 (макет кошелька). */
  height?: number;
  /**
   * Доступное название графика (`role="img"`): скринридер картинку не видит — перечисли
   * в названии главное («Баланс за день: с 5 600 до 6 700 ₽»).
   */
  'aria-label': string;
}

const VIEWBOX = 100;

/** Путь линии в квадрате 100×100 (y вниз), растягивается по размеру области. */
function linePath(values: number[], min: number, max: number, step: boolean): string {
  const y = (value: number) => round2(VIEWBOX - ratio(value, min, max) * VIEWBOX);
  if (values.length === 0) return `M0 ${VIEWBOX}H${VIEWBOX}`;
  if (values.length === 1) return `M0 ${y(values[0]!)}H${VIEWBOX}`;
  const x = (index: number) => round2((index / (values.length - 1)) * VIEWBOX);
  return values
    .map((value, index) => {
      if (index === 0) return `M${x(0)} ${y(value)}`;
      return step ? `H${x(index)}V${y(value)}` : `L${x(index)} ${y(value)}`;
    })
    .join('');
}

/**
 * Карточка-график «Изменение баланса» из макета кошелька: подписи оси Y над линиями сетки
 * слева, линия цвета primary 3px со скруглёнными концами (ступенчатая — `step`), подписи оси X
 * снизу. Растягивается по ширине; толщина линии от растяжения не меняется.
 */
export const LineChart = forwardRef<HTMLDivElement, LineChartProps>(function LineChart(
  {
    points,
    xLabels,
    yTicks,
    formatTick = String,
    step = false,
    title,
    height = 111,
    className,
    style,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const values = points.map((point) => finite(point.value));
  const ticks = (yTicks ?? axisTicks(niceWholeCeil(Math.max(0, ...values))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const min = Math.min(0, ...values, ...ticks);
  const top = Math.max(...values, ...ticks, min);
  const max = top > min ? top : min + 1;
  const labels = xLabels ?? [];

  return (
    <div
      ref={ref}
      className={cx('ui-line-chart', className)}
      style={{ '--ui-line-chart-height': `${height}px`, ...style } as CSSProperties}
      {...rest}
    >
      {title != null && title !== false && <div className="ui-line-chart__title">{title}</div>}
      <div className="ui-line-chart__figure" role="img" aria-label={ariaLabel}>
        <div className="ui-line-chart__plot">
          {ticks.map((tick, index) => (
            <div
              key={index}
              className="ui-line-chart__tick"
              style={
                { '--ui-line-chart-at': `${round2(ratio(tick, min, max) * 100)}%` } as CSSProperties
              }
            >
              <span className="ui-line-chart__tick-label">{formatTick(tick)}</span>
            </div>
          ))}
          <svg
            className="ui-line-chart__svg"
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className="ui-line-chart__line"
              d={linePath(values, min, max, step)}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        {labels.length > 0 && (
          <div className="ui-line-chart__x-axis">
            {labels.map((label, index) => (
              <span
                key={index}
                className="ui-line-chart__x-label"
                style={
                  {
                    '--ui-line-chart-x': `${labels.length > 1 ? round2((index / (labels.length - 1)) * 100) : 50}%`,
                  } as CSSProperties
                }
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
