/**
 * Roving tabindex: вычисляет следующий индекс по нажатой клавише.
 * Возвращает `null`, если клавиша не относится к навигации.
 */
export function getRovingIndex(
  key: string,
  current: number,
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): number | null {
  if (count === 0) return null;
  let direction: 1 | -1;
  let start: number;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      direction = 1;
      start = current;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      direction = -1;
      start = current;
      break;
    case 'Home':
      direction = 1;
      start = -1;
      break;
    case 'End':
      direction = -1;
      start = count;
      break;
    default:
      return null;
  }
  let next = start;
  for (let step = 0; step < count; step += 1) {
    next = (next + direction + count) % count;
    if (!isDisabled(next)) return next;
  }
  return null;
}
