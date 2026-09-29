/** Диаметр круга, когда ничего не сделано (чуть больше 153.85px из макета), px. */
export const BUBBLE_MAX_SIZE = 170;
/** Диаметр, когда сделано всё рекомендованное (и больше), px. */
export const BUBBLE_MIN_SIZE = 112;

/**
 * Правило кругов «Выполненные задания» (docs/04 §4.6): чем больше сделано, тем меньше круг.
 * Доля = сделано / рекомендовано (не больше 1); без рекомендованных — 1, если что-то сделано,
 * иначе 0. Диаметр линейно от `BUBBLE_MAX_SIZE` (доля 0) до `BUBBLE_MIN_SIZE` (доля 1).
 */
export function bubbleSize(done: number, recommended: number): number {
  const ratio = recommended > 0 ? Math.min(done / recommended, 1) : done > 0 ? 1 : 0;
  return BUBBLE_MAX_SIZE - (BUBBLE_MAX_SIZE - BUBBLE_MIN_SIZE) * ratio;
}
