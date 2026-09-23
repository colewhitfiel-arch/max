/**
 * Детерминированный «случай» демо-мира: одинаковая картина от запуска к запуску (сдачи заданий,
 * посещения по расписанию, поступления в кошелёк преподавателя). Не криптография.
 */

/** FNV-1a (32 бита). */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Число 0..mod−1 для пары (seed, salt). */
export const roll = (seed: string, salt: string, mod: number) => hash(`${seed}:${salt}`) % mod;
