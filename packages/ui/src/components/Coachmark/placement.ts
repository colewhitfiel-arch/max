/** Прямоугольник во viewport (как у `getBoundingClientRect`). */
export interface CoachmarkRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Где карточка относительно подсветки: под ней, над ней, поверх (не влезла) или по центру. */
export type CoachmarkSide = 'bottom' | 'top' | 'overlay' | 'center';

export interface CoachmarkPlacement {
  /** Подсветка: цель, расширенная на `padding` и обрезанная по краям экрана; null — без цели. */
  spotlight: CoachmarkRect | null;
  top: number;
  left: number;
  side: CoachmarkSide;
  /** Центр стрелки от левого края карточки; null — стрелки нет. */
  arrowX: number | null;
}

export interface PlacementOptions {
  /** Отступ карточки от краёв экрана. */
  margin: number;
  /** Зазор между подсветкой и карточкой (в нём рисуется стрелка). */
  gap: number;
  /** На сколько подсветка шире цели с каждой стороны. */
  padding: number;
  /** Край экрана для карточки, не влезшей рядом с целью. По умолчанию — нижний. */
  overlaySide?: 'top' | 'bottom';
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Стрелка не заходит в скругления углов карточки. */
const ARROW_INSET = 28;

/**
 * Раскладка шага тура: карточка под подсветкой, если там хватает места, иначе над ней; не влезла
 * ни туда, ни туда (цель почти на весь экран) — у края `overlaySide` поверх подсветки. Без цели —
 * по центру экрана. По горизонтали карточка центрируется на цели и не выходит за края.
 */
export function placeCoachmark(
  target: CoachmarkRect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  { margin, gap, padding, overlaySide = 'bottom' }: PlacementOptions,
): CoachmarkPlacement {
  const centered = {
    top: clamp((viewport.height - card.height) / 2, margin, viewport.height - card.height),
    left: clamp((viewport.width - card.width) / 2, margin, viewport.width - card.width),
  };
  if (!target) return { spotlight: null, ...centered, side: 'center', arrowX: null };

  const top = clamp(target.top - padding, 0, viewport.height);
  const left = clamp(target.left - padding, 0, viewport.width);
  const bottom = clamp(target.top + target.height + padding, top, viewport.height);
  const right = clamp(target.left + target.width + padding, left, viewport.width);
  const spotlight = { top, left, width: right - left, height: bottom - top };

  // Цель целиком за экраном (прокрутка не помогла) — подсвечивать нечего.
  if (spotlight.width === 0 || spotlight.height === 0) {
    return { spotlight: null, ...centered, side: 'center', arrowX: null };
  }

  const centerX = left + spotlight.width / 2;
  const cardLeft = clamp(centerX - card.width / 2, margin, viewport.width - margin - card.width);
  const arrowX = clamp(centerX - cardLeft, ARROW_INSET, card.width - ARROW_INSET);
  const need = card.height + gap;

  if (viewport.height - margin - bottom >= need) {
    return { spotlight, top: bottom + gap, left: cardLeft, side: 'bottom', arrowX };
  }
  if (top - margin >= need) {
    return { spotlight, top: top - gap - card.height, left: cardLeft, side: 'top', arrowX };
  }
  return {
    spotlight,
    top:
      overlaySide === 'top'
        ? margin
        : clamp(viewport.height - margin - card.height, margin, viewport.height - card.height),
    left: cardLeft,
    side: 'overlay',
    arrowX: null,
  };
}
