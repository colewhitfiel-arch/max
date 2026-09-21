import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ChevronsDownIcon, LockIcon } from '../../icons';
import { cx } from '../../lib/cx';
import { durations } from '../../tokens';
import './PlanetMap.css';

export interface PlanetMapItem {
  key: string;
  /** Картинка планеты (png/svg с прозрачностью). */
  image: string;
  /** Крупное число над подписью (баллы, счётчик). Без него строка остаётся пустой. */
  value?: ReactNode;
  /** Подпись под линией (название). */
  label: ReactNode;
  /** Пометка над планетой: текст + стрелка вниз (например, «сделать до завтра»). */
  marker?: ReactNode;
  /** Доступное название планеты (alt / имя кнопки). По умолчанию — текст `label`. */
  title?: string;
  /** Планета становится кнопкой. */
  onClick?: () => void;
  /** Заблокирована: серая, с замком (предмет не выбран). */
  locked?: boolean;
}

export interface PlanetMapProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Планеты по порядку вдоль траектории: первая — вверху справа, дальше вниз-влево.
   * Видны четыре; остальные листаются свайпом вправо по траектории или стрелками.
   */
  items: PlanetMapItem[];
  /** Картинка фона (звёзды) за всей картой; накладывается полупрозрачно. */
  backdrop?: string;
  /** Занять свободную высоту родителя (для `Screen fill`): фон тянется до низа экрана. */
  grow?: boolean;
  /** Вытянуть на боковые поля `Screen` (16px) — карта на всю ширину экрана. */
  bleed?: boolean;
  /** Индекс первой видимой планеты при монтировании. По умолчанию 0. */
  defaultOffset?: number;
  /** Вызывается при перелистывании (индекс первой видимой планеты). */
  onOffsetChange?: (offset: number) => void;
  /** Доступное название карты («Карта заданий по кружкам»). */
  'aria-label'?: string;
}

/* Геометрия из макета (ширина 402): планеты одного размера на кривой траектории из левого
 * нижнего угла в правый верхний (у низа — круто вверх, к верху — положе), с одинаковым шагом
 * по длине дуги. Координаты — px макета, рендерятся в процентах, чтобы карта масштабировалась. */
const VIEW_W = 402;
const VIEW_H = 460;
/** Сколько планет видно одновременно (слотов на траектории). */
export const PLANET_MAP_WINDOW = 4;
const PLANET_SIZE = 96;
/** Высота крупного числа: подпись ставится так, чтобы число лежало на линии. */
const VALUE_H = 30;
/** Порог, после которого движение считается свайпом, а не тапом. */
const DRAG_THRESHOLD = 6;
const SLIDE_MS = durations.normal * 1.6;

interface Point {
  x: number;
  y: number;
}

interface Planet {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Траектория макета — кубическая Безье через центры четырёх планет (низ-лево → верх-право). */
const TRACK: [Point, Point, Point, Point] = [
  { x: 55, y: 352 },
  { x: 23, y: 254 },
  { x: 275, y: 114 },
  { x: 335, y: 96 },
];

function bezier([p0, p1, p2, p3]: typeof TRACK, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Точки кривой с равным шагом по длине дуги (первая и последняя — концы кривой). */
function sampleEvenly(track: typeof TRACK, count: number): { points: Point[]; step: number } {
  const segments = 400;
  const samples: Point[] = [];
  const lengths: number[] = [0];
  for (let i = 0; i <= segments; i += 1) {
    const point = bezier(track, i / segments);
    if (i > 0) {
      const prev = samples[i - 1]!;
      lengths.push(lengths[i - 1]! + Math.hypot(point.x - prev.x, point.y - prev.y));
    }
    samples.push(point);
  }
  const total = lengths[segments]!;
  const step = total / (count - 1);
  const points = Array.from({ length: count }, (_, k) => {
    const target = step * k;
    const index = lengths.findIndex((length) => length >= target);
    return samples[index === -1 ? segments : index]!;
  });
  return { points, step };
}

const { points: SLOT_CENTERS, step: TRACK_STEP } = sampleEvenly(TRACK, PLANET_MAP_WINDOW);
const TRACK_START = SLOT_CENTERS[0]!;
const TRACK_END = SLOT_CENTERS[PLANET_MAP_WINDOW - 1]!;
/** Хорда траектории: направление свайпа и выезда планет за край. */
const CHORD = { x: TRACK_END.x - TRACK_START.x, y: TRACK_END.y - TRACK_START.y };
const CHORD_LENGTH = Math.hypot(CHORD.x, CHORD.y);
/** Шаг между соседними планетами по горизонтали, px макета: один свайп — одна планета. */
const STEP_X = CHORD.x / (PLANET_MAP_WINDOW - 1);
/** Наклон хорды (dy/dx): контент при свайпе едет по диагонали. */
const TRACK_SLOPE = CHORD.y / CHORD.x;

function planetAround(center: Point): Planet {
  return {
    x: center.x - PLANET_SIZE / 2,
    y: center.y - PLANET_SIZE / 2,
    w: PLANET_SIZE,
    h: PLANET_SIZE,
  };
}

/** Планета в слоте траектории (0 — нижняя левая, 3 — верхняя правая). */
const planetAt = (slot: number): Planet => planetAround(SLOT_CENTERS[slot]!);

/** Планета за концом траектории: на 0.8 шага дальше по хорде (краешек виден у края карты). */
function planetBeyond(from: Point, direction: 1 | -1): Planet {
  const distance = (TRACK_STEP * 0.8 * direction) / CHORD_LENGTH;
  return planetAround({ x: from.x + CHORD.x * distance, y: from.y + CHORD.y * distance });
}

interface Slot {
  planet: Planet;
  /**
   * Край подписи и y горизонтальной линии (число над ней, название под ней).
   * `align: 'end'` — подпись прижата к `x` справа и растёт влево (слот левее планеты).
   */
  label: { x: number; y: number; align?: 'end' };
  /** Ломаная «подпись — планета» (3 точки). */
  line: [number, number][];
  /**
   * Где стоит пометка. По умолчанию — над планетой по центру, стрелка вниз;
   * `side: 'bottom'` — под планетой, стрелка вверх (когда сверху места нет).
   */
  marker?: { x: number; y: number; side: 'bottom' };
}

/** Слоты снизу-слева вверх-вправо; подписи чередуют стороны, как в макете. */
const SLOTS: Slot[] = [
  {
    planet: planetAt(0),
    label: { x: 103, y: 420 },
    line: [
      [68, 383],
      [103, 420],
      [143, 420],
    ],
    // Над нижней планетой стоит соседняя — пометка уходит под неё.
    marker: { x: 50, y: 402, side: 'bottom' },
  },
  {
    planet: planetAt(1),
    label: { x: 170, y: 295 },
    line: [
      [145, 270],
      [170, 295],
      [234, 295],
    ],
  },
  {
    planet: planetAt(2),
    label: { x: 186, y: 99, align: 'end' },
    line: [
      [108, 99],
      [186, 99],
      [198, 115],
    ],
  },
  {
    planet: planetAt(3),
    label: { x: 286, y: 176 },
    line: [
      [286, 176],
      [330, 176],
      [333, 140],
    ],
  },
];

/** Краешки соседних планет за пределами окна: намёк, что дальше есть ещё. */
const EDGE_PREV = planetBeyond(TRACK_END, 1);
const EDGE_NEXT = planetBeyond(TRACK_START, -1);

/** Первая видимая планета стоит вверху справа, следующие спускаются по траектории влево-вниз. */
const slotForRel = (rel: number): Slot | undefined => SLOTS[PLANET_MAP_WINDOW - 1 - rel];

const px = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function planetStyle(planet: Planet): CSSProperties {
  return {
    left: px(planet.x, VIEW_W),
    top: px(planet.y, VIEW_H),
    width: px(planet.w, VIEW_W),
    aspectRatio: `${planet.w} / ${planet.h}`,
  };
}

/**
 * «Карта планет»: картинки-планеты с одинаковым шагом на кривой траектории из макета поверх
 * звёздного фона, к каждой — подпись (крупное число + название) с тонкой линией-выноской
 * и необязательная пометка. Видны четыре планеты; свайп вправо (или →) ведёт контент
 * вверх по траектории, следующие планеты входят снизу-слева. Домена не знает.
 */
export const PlanetMap = forwardRef<HTMLDivElement, PlanetMapProps>(function PlanetMap(
  {
    items,
    backdrop,
    grow = false,
    bleed = false,
    defaultOffset = 0,
    onOffsetChange,
    className,
    style,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const maxOffset = Math.max(0, items.length - PLANET_MAP_WINDOW);
  const [rawOffset, setRawOffset] = useState(defaultOffset);
  const offset = clamp(rawOffset, 0, maxOffset);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; started: boolean } | null>(null);
  const suppressClickUntil = useRef(0);

  // Пока планеты едут между слотами, подписи и линии спрятаны — их геометрия не анимируется.
  useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => setMoving(false), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [moving]);

  const goTo = (next: number) => {
    const target = clamp(next, 0, maxOffset);
    if (target === offset) return;
    setRawOffset(target);
    setMoving(true);
    onOffsetChange?.(target);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || maxOffset === 0) return;
    drag.current = { x: event.clientX, y: event.clientY, started: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.started) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // Вертикальное движение — это скролл экрана, не наш свайп.
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      state.started = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    // На краях — «резинка».
    const atEdge = (dx < 0 && offset === 0) || (dx > 0 && offset === maxOffset);
    setDragX(atEdge ? dx * 0.35 : dx);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.started) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const dx = event.clientX - state.x;
    const scale = (canvasRef.current?.clientWidth ?? VIEW_W) / VIEW_W;
    const stepPx = STEP_X * scale;
    // Свайп вправо-вверх открывает следующие планеты (они входят снизу-слева).
    let steps = Math.round(dx / stepPx);
    if (steps === 0 && Math.abs(dx) > stepPx * 0.35) steps = dx > 0 ? 1 : -1;
    suppressClickUntil.current = Date.now() + 400;
    setDragging(false);
    setDragX(0);
    goTo(offset + steps);
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (Date.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      goTo(offset + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      goTo(offset - 1);
    }
  };

  const canvasStyle = {
    '--ui-planet-map-ratio': `${VIEW_W} / ${VIEW_H}`,
    transform: dragX ? `translate(${dragX}px, ${(dragX * TRACK_SLOPE).toFixed(1)}px)` : undefined,
  } as CSSProperties;

  const visible = items
    .map((item, index) => ({ item, rel: index - offset }))
    .filter(({ rel }) => rel >= -1 && rel <= PLANET_MAP_WINDOW);

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
      <div
        ref={canvasRef}
        className="ui-planet-map__canvas"
        style={canvasStyle}
        data-dragging={dragging || undefined}
        data-moving={moving || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        <svg
          className="ui-planet-map__lines"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {visible.map(({ item, rel }) => {
            const slot = slotForRel(rel);
            return slot ? (
              <polyline
                key={item.key}
                points={slot.line.map(([x, y]) => `${x},${y}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            ) : null;
          })}
        </svg>
        <ul
          className="ui-planet-map__list"
          aria-label={ariaLabel}
          tabIndex={maxOffset > 0 ? 0 : undefined}
          onKeyDown={onKeyDown}
        >
          {visible.map(({ item, rel }) => {
            const slot = slotForRel(rel);
            const planet = slot ? slot.planet : rel < 0 ? EDGE_PREV : EDGE_NEXT;
            const title = item.title ?? (typeof item.label === 'string' ? item.label : undefined);
            const clickable = !!item.onClick && !!slot && !item.locked;
            const image = (
              <>
                <img className="ui-planet-map__image" src={item.image} alt="" draggable={false} />
                {item.locked && (
                  <span className="ui-planet-map__lock" aria-hidden="true">
                    <LockIcon size={20} />
                  </span>
                )}
              </>
            );
            return (
              <li key={item.key} className="ui-planet-map__item" data-edge={!slot || undefined}>
                {clickable ? (
                  <button
                    type="button"
                    className="ui-planet-map__planet"
                    style={planetStyle(planet)}
                    aria-label={title}
                    onClick={item.onClick}
                  >
                    {image}
                  </button>
                ) : (
                  <div
                    className="ui-planet-map__planet"
                    style={planetStyle(planet)}
                    data-locked={item.locked || undefined}
                    role={title && slot ? 'img' : undefined}
                    aria-label={slot ? title : undefined}
                    aria-hidden={slot ? undefined : true}
                  >
                    {image}
                  </div>
                )}
                {slot && (
                  <div
                    className="ui-planet-map__label"
                    data-align={slot.label.align}
                    style={
                      slot.label.align === 'end'
                        ? {
                            right: px(VIEW_W - slot.label.x, VIEW_W),
                            top: px(slot.label.y - VALUE_H, VIEW_H),
                            maxWidth: px(slot.label.x, VIEW_W),
                          }
                        : {
                            left: px(slot.label.x, VIEW_W),
                            top: px(slot.label.y - VALUE_H, VIEW_H),
                            maxWidth: px(VIEW_W - slot.label.x, VIEW_W),
                          }
                    }
                  >
                    <span className="ui-planet-map__value">{item.value}</span>
                    <span className="ui-planet-map__name">{item.label}</span>
                  </div>
                )}
                {slot && item.marker && (
                  <div
                    className="ui-planet-map__marker"
                    data-side={slot.marker?.side}
                    style={{
                      left: px(slot.marker?.x ?? slot.planet.x + slot.planet.w / 2, VIEW_W),
                      top: px(slot.marker?.y ?? slot.planet.y, VIEW_H),
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
