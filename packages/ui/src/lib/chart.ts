/*
 * Общая арифметика графиков (LineChart, BarChart): «круглые» деления оси и доли высоты.
 * Домена не знает — только числа.
 */

/** Конечное число или 0 (NaN/Infinity из данных не ломают разметку). */
export function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * «Круглый» верх оси: ближайшее сверху 1 / 2 / 4 / 5 / 10 × 10ᵏ (6700 → 10000, 12388 → 20000,
 * 23 → 40). Середина круглая, начиная с верха 10; ниже она бывает дробной (5 → 2,5, 1 → 0,5) —
 * для целых подписей есть `niceWholeCeil`. Для значений ≤ 0 — 0.
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 2, 4, 5, 10].find((candidate) => normalized <= candidate + 1e-9) ?? 10;
  return step * magnitude;
}

/**
 * Как `niceCeil`, но и верх, и середина — целые: малые максимумы (верх < 10) поднимаются до
 * 2 / 4 / 10 (0 / 1 / 2, 0 / 2 / 4, 0 / 5 / 10), с верха 10 середина и так целая. Для ≤ 0 — 0.
 */
export function niceWholeCeil(value: number): number {
  const top = niceCeil(value);
  if (top === 0 || top >= 10) return top;
  return [2, 4, 10].find((candidate) => value <= candidate) ?? 10;
}

/** Деления оси «0 / середина / верх»; верх ≤ 0 — одно деление 0. */
export function axisTicks(top: number): number[] {
  return top > 0 ? [0, top / 2, top] : [0];
}

/** Доля значения в диапазоне [min, max], обрезанная до 0…1. */
export function ratio(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Число для атрибутов SVG/стилей: не больше двух знаков после запятой, без хвостовых нулей. */
export function round2(value: number): string {
  return String(Math.round(value * 100) / 100);
}
