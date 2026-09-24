import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import { HeartAvatar } from '../HeartAvatar';
import './HeartCarousel.css';

export interface HeartCarouselItem {
  key: string;
  /** Имя: инициалы, если нет фото. */
  name: string;
  /** Подпись под сердцем («Иванов Е. А»); она же — доступное название пункта. */
  label: ReactNode;
  /** Фото. */
  src?: string | null;
}

export interface HeartCarouselProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Дети по порядку. Пустой список — в центре только «+». */
  items: HeartCarouselItem[];
  /** Ключ выбранного (controlled). `null` — никто не выбран, по центру первый. */
  value: string | null;
  /** Выбор: тап по сердцу, стрелки или свайп (выбирается сердце, остановившееся в центре). */
  onChange: (key: string) => void;
  /** Тап по белому сердцу с плюсом (всегда последнее). Свайп на него выбор не меняет. */
  onAdd: () => void;
  /** Подпись и доступное название сердца с плюсом («Добавить ребёнка»). */
  addLabel: string;
  /** Доступное название списка (`role="listbox"`). */
  'aria-label': string;
  /** Вытянуть на боковые поля `Screen` (16px) — лента на всю ширину экрана. По умолчанию `true`. */
  bleed?: boolean;
}

/** Движение мышью дальше порога — перетаскивание ленты, а не клик. */
const DRAG_THRESHOLD = 6;
/** Доля слота, после которой короткий рывок мышью листает к соседу. */
const FLICK_RATIO = 0.15;
/** Пауза после последнего события scroll: лента встала (запасной вариант к `scrollend`). */
const SETTLE_MS = 120;
/** Дальше двух слотов от центра сердца уже скрыты — считать незачем. */
const MAX_DISTANCE = 2;

interface DragState {
  pointerId: number;
  startX: number;
  startLeft: number;
  startIndex: number;
  moved: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Лента детей-сердец из макета родителя: выбранное сердце по центру (крупное, primary),
 * соседи меньше, приподняты дугой и выглядывают у краёв экрана; последним всегда идёт
 * белое сердце с плюсом. Листается свайпом со scroll-snap (мышью — перетаскиванием):
 * пока лента едет, размер, подъём, прозрачность и цвет каждого сердца плавно следуют
 * за расстоянием до центра (rAF), остановившееся в центре сердце выбирается.
 * Тап по соседу докатывает его в центр; ←/→/Home/End — выбор с клавиатуры.
 * `prefers-reduced-motion` — докрутка без анимации.
 */
export const HeartCarousel = forwardRef<HTMLDivElement, HeartCarouselProps>(function HeartCarousel(
  {
    items,
    value,
    onChange,
    onAdd,
    addLabel,
    'aria-label': ariaLabel,
    bleed = true,
    className,
    ...rest
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  /** Центры пунктов (дети + «+») в координатах ленты, px. */
  const centersRef = useRef<number[]>([]);
  /** Индекс пункта, ближайшего к центру на последнем кадре. */
  const centeredRef = useRef(0);
  const frameRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragRef = useRef<DragState | null>(null);
  const touchingRef = useRef(false);
  /**
   * Последний ввод — Tab с клавиатуры (сбрасывается любым нажатием указателем). Только тогда
   * фокус докатывает пункт в центр: фокус от тапа (на тач-экранах он приходит позже клика)
   * и возврат фокуса на «+» после закрытия шторки ленту не двигают.
   */
  const keyboardNavRef = useRef(false);
  const suppressClickRef = useRef(false);
  const mountedRef = useRef(false);

  // Актуальные пропсы для обработчиков нативных событий (scroll/scrollend/resize).
  const selectedIndex = items.findIndex((item) => item.key === value);
  /** Пункт, который стоит по центру «в покое»: выбранный, иначе первый (или «+»). */
  const restIndex = Math.max(0, selectedIndex);
  const latest = useRef({ items, value, onChange, restIndex });
  latest.current = { items, value, onChange, restIndex };
  const itemsKey = items.map((item) => item.key).join('\u0000');

  const getNodes = useCallback(
    (): HTMLElement[] =>
      Array.from(
        viewportRef.current?.querySelectorAll<HTMLElement>('.ui-heart-carousel__item') ?? [],
      ),
    [],
  );

  /** Ширина слота = половина видимой ширины: соседи центрируются по краям экрана. */
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth) return;
    viewport.style.setProperty('--ui-heart-carousel-slot', `${viewport.clientWidth / 2}px`);
    centersRef.current = getNodes().map((node) => node.offsetLeft + node.offsetWidth / 2);
  }, [getNodes]);

  const nearestIndex = useCallback((): number => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    let best = 0;
    centersRef.current.forEach((position, index) => {
      const bestPosition = centersRef.current[best] ?? 0;
      if (Math.abs(position - center) < Math.abs(bestPosition - center)) best = index;
    });
    return best;
  }, []);

  /**
   * Кадр анимации: для каждого сердца — расстояние до центра в слотах. Сам вид
   * (масштаб, дуга, прозрачность, цвет) считает CSS из этих переменных.
   */
  const paint = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth) return;
    const slot = viewport.clientWidth / 2;
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    getNodes().forEach((node, index) => {
      const position = centersRef.current[index];
      if (position === undefined) return;
      const offset = Math.max(-MAX_DISTANCE, Math.min(MAX_DISTANCE, (position - center) / slot));
      const distance = Math.abs(offset);
      node.style.setProperty('--ui-heart-carousel-offset', offset.toFixed(4));
      node.style.setProperty('--ui-heart-carousel-distance', distance.toFixed(4));
      node.style.setProperty(
        '--ui-heart-carousel-arc',
        (1 - Math.cos((distance * Math.PI) / 2)).toFixed(4),
      );
      node.style.setProperty('--ui-heart-carousel-focus', Math.max(0, 1 - distance).toFixed(4));
    });
    centeredRef.current = nearestIndex();
  }, [getNodes, nearestIndex]);

  const scrollToIndex = useCallback(
    (index: number, smooth: boolean) => {
      const viewport = viewportRef.current;
      const position = centersRef.current[index];
      if (!viewport || position === undefined) return;
      const left = position - viewport.clientWidth / 2;
      const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
      if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left, behavior });
      else viewport.scrollLeft = left;
      if (behavior === 'auto') paint();
    },
    [paint],
  );

  /** Лента остановилась: снова включить snap после мыши и выбрать сердце в центре. */
  const settle = useCallback(() => {
    clearTimeout(settleTimerRef.current);
    const viewport = viewportRef.current;
    if (!viewport || touchingRef.current || dragRef.current?.moved) return;
    viewport.removeAttribute('data-dragging');
    const { items: current, value: selected, onChange: change } = latest.current;
    const item = current[nearestIndex()];
    // За последним ребёнком — «+»: его центрирование выбор не меняет.
    if (item && item.key !== selected) change(item.key);
  }, [nearestIndex]);

  const scheduleSettle = useCallback(() => {
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(settle, SETTLE_MS);
  }, [settle]);

  // Выбор или состав детей поменялся — докрутить выбранного в центр
  // (при монтировании — мгновенно, до первой отрисовки).
  useLayoutEffect(() => {
    measure();
    const first = !mountedRef.current;
    mountedRef.current = true;
    if (first || nearestIndex() !== restIndex) scrollToIndex(restIndex, !first);
    paint();
  }, [itemsKey, restIndex, measure, nearestIndex, paint, scrollToIndex]);

  // Прокрутка (палец, колесо, докрутка): кадр через rAF, выбор — когда лента встанет.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const hasScrollEnd = 'onscrollend' in window;
    const onScroll = () => {
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0;
          paint();
        });
      }
      // Запасной таймер: сдвигается, пока лента едет (инерция после пальца тоже);
      // где есть scrollend, он срабатывает раньше и таймер сбрасывает.
      scheduleSettle();
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    if (hasScrollEnd) viewport.addEventListener('scrollend', settle);
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (hasScrollEnd) viewport.removeEventListener('scrollend', settle);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      clearTimeout(settleTimerRef.current);
    };
  }, [paint, settle, scheduleSettle]);

  // Откуда придёт следующий фокус: Tab — с клавиатуры, любое нажатие указателем — нет.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Tab') keyboardNavRef.current = true;
    };
    const onPointerDown = () => {
      keyboardNavRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  // Ширина поменялась (поворот, окно) — пересчитать слоты и удержать сердце в центре.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;
    let width = viewport.clientWidth;
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth === width) return;
      // Лента была скрыта (ширина 0) — позиций ещё не было, в центр встаёт выбранный.
      const keep = width ? centeredRef.current : latest.current.restIndex;
      width = viewport.clientWidth;
      measure();
      scrollToIndex(keep, false);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measure, scrollToIndex]);

  /** Выбрать ребёнка и докатить его в центр (тап, клавиатура). */
  const select = (index: number, focus = false) => {
    const item = items[index];
    if (!item) return;
    if (item.key !== value) onChange(item.key);
    scrollToIndex(index, true);
    if (focus) optionRefs.current[index]?.focus({ preventScroll: true });
  };

  /** Стрелки без зацикливания: лента не должна перелетать с последнего на первого. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(last, restIndex + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, restIndex - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next == null) return;
    event.preventDefault();
    select(next, true);
  };

  /** Фокус с клавиатуры (Tab) докатывает пункт в центр, не меняя выбор. */
  const handleFocus = (index: number) => {
    if (keyboardNavRef.current && centeredRef.current !== index) scrollToIndex(index, true);
  };

  /* Мышь: лента тянется за курсором (snap на время выключен), после отпускания
   * докатывается к ближайшему сердцу; короткий рывок листает к соседу. Касания
   * обрабатывает сам браузер (нативный скролл со snap). */
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.pointerType !== 'mouse' || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: viewport.scrollLeft,
      startIndex: nearestIndex(),
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    // Кнопку отпустили за лентой (до порога захвата нет — pointerup сюда не дошёл):
    // это уже наведение, а не перетаскивание — сбросить и дать ленте встать.
    if ((event.buttons & 1) === 0) {
      dragRef.current = null;
      viewport.removeAttribute('data-dragging');
      scheduleSettle();
      return;
    }
    const dx = event.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      drag.moved = true;
      viewport.setPointerCapture?.(event.pointerId);
      viewport.setAttribute('data-dragging', '');
    }
    viewport.scrollLeft = drag.startLeft - dx;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return;
    if (viewport.hasPointerCapture?.(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (!cancelled) {
      // Клик после перетаскивания не должен выбирать сердце под курсором.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    const dx = event.clientX - drag.startX;
    const last = centersRef.current.length - 1;
    let target = nearestIndex();
    if (target === drag.startIndex && Math.abs(dx) > (viewport.clientWidth / 2) * FLICK_RATIO) {
      target = Math.max(0, Math.min(last, drag.startIndex - Math.sign(dx)));
    }
    const position = centersRef.current[target] ?? 0;
    if (Math.abs(position - viewport.clientWidth / 2 - viewport.scrollLeft) < 1) settle();
    else scrollToIndex(target, true);
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const addIndex = items.length;

  return (
    <div
      ref={ref}
      className={cx('ui-heart-carousel', className)}
      data-bleed={bleed || undefined}
      {...rest}
    >
      <div
        ref={viewportRef}
        className="ui-heart-carousel__viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
        onLostPointerCapture={(event) => endDrag(event, true)}
        onClickCapture={handleClickCapture}
        onTouchStart={() => {
          touchingRef.current = true;
        }}
        onTouchEnd={() => {
          touchingRef.current = false;
          scheduleSettle();
        }}
        onTouchCancel={() => {
          touchingRef.current = false;
          scheduleSettle();
        }}
      >
        <div className="ui-heart-carousel__track">
          {items.length > 0 && (
            <div
              className="ui-heart-carousel__list"
              role="listbox"
              aria-label={ariaLabel}
              aria-orientation="horizontal"
              onKeyDown={handleKeyDown}
            >
              {items.map((item, index) => {
                const selected = item.key === value;
                return (
                  <div
                    key={item.key}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    className="ui-heart-carousel__item"
                    role="option"
                    aria-selected={selected}
                    tabIndex={index === restIndex ? 0 : -1}
                    data-selected={selected || undefined}
                    onClick={() => select(index)}
                    onFocus={() => handleFocus(index)}
                  >
                    <HeartAvatar
                      className="ui-heart-carousel__heart"
                      name={item.name}
                      src={item.src}
                      tone={selected ? 'primary' : 'accent'}
                      aria-hidden
                    />
                    <span className="ui-heart-carousel__label">{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="ui-heart-carousel__item"
            data-add=""
            onClick={onAdd}
            onFocus={() => handleFocus(addIndex)}
          >
            <HeartAvatar
              className="ui-heart-carousel__heart"
              name={addLabel}
              tone="plain"
              add
              aria-hidden
            />
            <span className="ui-heart-carousel__label">{addLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
