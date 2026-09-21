import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronsDownIcon } from '../../icons';
import { cx } from '../../lib/cx';
import './PlanetMap.css';

export interface PlanetMapItem {
  key: string;
  /** Картинка планеты (png/svg с прозрачностью). */
  image: string;
  /** Крупное число над подписью (баллы, счётчик). */
  value: ReactNode;
  /** Подпись под линией (название). */
  label: ReactNode;
  /** Пометка над планетой: текст + стрелка вниз (например, «сделать до завтра»). */
  marker?: ReactNode;
  /** Доступное название планеты (alt / имя кнопки). По умолчанию — текст `label`. */
  title?: string;
  /** Планета становится кнопкой. */
  onClick?: () => void;
}

export interface PlanetMapProps extends HTMLAttributes<HTMLDivElement> {
  items: PlanetMapItem[];
  /** Картинка фона (звёзды) за всей картой; накладывается полупрозрачно. */
  backdrop?: string;
  /** Занять свободную высоту родителя (для `Screen fill`): фон тянется до низа экрана. */
  grow?: boolean;
  /** Вытянуть на боковые поля `Screen` (16px) — карта на всю ширину экрана. */
  bleed?: boolean;
  /** Доступное название карты («Карта заданий по кружкам»). */
  'aria-label'?: string;
}

/* Геометрия из макета (ширина 402): четыре слота-«витка» по диагонали сверху-справа
 * вниз-влево; пятая и следующие планеты повторяют виток ниже. Координаты — px макета,
 * рендерятся в процентах, чтобы карта масштабировалась с шириной экрана. */
const VIEW_W = 402;
/** Высота одного витка из четырёх слотов. */
const LOOP_H = 460;
/** Высота крупного числа: подпись ставится так, чтобы число лежало на линии. */
const VALUE_H = 30;

interface Slot {
  planet: { x: number; y: number; w: number; h: number };
  /**
   * Край подписи и y горизонтальной линии (число над ней, название под ней).
   * `align: 'end'` — подпись прижата к `x` справа и растёт влево (слот левее планеты).
   */
  label: { x: number; y: number; align?: 'end' };
  /** Ломаная «подпись — планета» (3 точки). */
  line: [number, number][];
  /** Нижняя граница слота (для высоты карты). */
  bottom: number;
}

const SLOTS: Slot[] = [
  {
    planet: { x: 283, y: 44, w: 104, h: 104 },
    label: { x: 266, y: 181 },
    line: [
      [266, 181],
      [340, 181],
      [346, 125],
    ],
    bottom: 205,
  },
  {
    planet: { x: 190, y: 110, w: 77, h: 77 },
    label: { x: 208, y: 101, align: 'end' },
    line: [
      [121, 101],
      [208, 101],
      [221, 116],
    ],
    bottom: 195,
  },
  {
    planet: { x: 46, y: 190, w: 108, h: 112 },
    label: { x: 157, y: 301 },
    line: [
      [125, 281],
      [157, 301],
      [221, 301],
    ],
    bottom: 325,
  },
  {
    planet: { x: 11, y: 302, w: 88, h: 100 },
    label: { x: 103, y: 420 },
    line: [
      [68, 383],
      [103, 420],
      [143, 420],
    ],
    bottom: 445,
  },
];

function slotOf(index: number): Slot {
  const base = SLOTS[index % SLOTS.length]!;
  const dy = Math.floor(index / SLOTS.length) * LOOP_H;
  if (dy === 0) return base;
  return {
    planet: { ...base.planet, y: base.planet.y + dy },
    label: { ...base.label, y: base.label.y + dy },
    line: base.line.map(([x, y]) => [x, y + dy] as [number, number]),
    bottom: base.bottom + dy,
  };
}

const px = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;

/**
 * «Карта планет»: картинки-планеты, разбросанные по звёздному фону, к каждой — подпись
 * (крупное число + название) с тонкой линией-выноской и необязательная пометка над планетой.
 * Домена не знает: что за число и картинка — решает потребитель.
 */
export const PlanetMap = forwardRef<HTMLDivElement, PlanetMapProps>(function PlanetMap(
  {
    items,
    backdrop,
    grow = false,
    bleed = false,
    className,
    style,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const slots = items.map((_, index) => slotOf(index));
  const viewH = Math.max(1, ...slots.map((slot) => slot.bottom));
  const canvasStyle = { '--ui-planet-map-ratio': `${VIEW_W} / ${viewH}` } as CSSProperties;

  return (
    <div
      ref={ref}
      className={cx('ui-planet-map', className)}
      data-grow={grow || undefined}
      data-bleed={bleed || undefined}
      style={style}
      {...rest}
    >
      {backdrop && (
        <div
          className="ui-planet-map__backdrop"
          style={{ backgroundImage: `url(${backdrop})` }}
          aria-hidden="true"
        />
      )}
      <div className="ui-planet-map__canvas" style={canvasStyle}>
        <svg
          className="ui-planet-map__lines"
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {slots.map((slot, index) => (
            <polyline
              key={items[index]!.key}
              points={slot.line.map(([x, y]) => `${x},${y}`).join(' ')}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <ul className="ui-planet-map__list" aria-label={ariaLabel}>
          {items.map((item, index) => {
            const slot = slots[index]!;
            const title = item.title ?? (typeof item.label === 'string' ? item.label : undefined);
            const planetStyle: CSSProperties = {
              left: px(slot.planet.x, VIEW_W),
              top: px(slot.planet.y, viewH),
              width: px(slot.planet.w, VIEW_W),
              aspectRatio: `${slot.planet.w} / ${slot.planet.h}`,
            };
            const image = <img className="ui-planet-map__image" src={item.image} alt="" />;
            return (
              <li key={item.key} className="ui-planet-map__item">
                {item.onClick ? (
                  <button
                    type="button"
                    className="ui-planet-map__planet"
                    style={planetStyle}
                    aria-label={title}
                    onClick={item.onClick}
                  >
                    {image}
                  </button>
                ) : (
                  <div
                    className="ui-planet-map__planet"
                    style={planetStyle}
                    role={title ? 'img' : undefined}
                    aria-label={title}
                  >
                    {image}
                  </div>
                )}
                <div
                  className="ui-planet-map__label"
                  data-align={slot.label.align}
                  style={
                    slot.label.align === 'end'
                      ? {
                          right: px(VIEW_W - slot.label.x, VIEW_W),
                          top: px(slot.label.y - VALUE_H, viewH),
                          maxWidth: px(slot.label.x, VIEW_W),
                        }
                      : {
                          left: px(slot.label.x, VIEW_W),
                          top: px(slot.label.y - VALUE_H, viewH),
                          maxWidth: px(VIEW_W - slot.label.x, VIEW_W),
                        }
                  }
                >
                  <span className="ui-planet-map__value">{item.value}</span>
                  <span className="ui-planet-map__name">{item.label}</span>
                </div>
                {item.marker && (
                  <div
                    className="ui-planet-map__marker"
                    style={{
                      left: px(slot.planet.x + slot.planet.w / 2, VIEW_W),
                      top: px(slot.planet.y, viewH),
                    }}
                  >
                    <span className="ui-planet-map__marker-text">{item.marker}</span>
                    <ChevronsDownIcon className="ui-planet-map__marker-arrow" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
});
