import type { ClubBrief } from '@edu/contracts';
import art from './assets/club-art.png';
import chess from './assets/club-chess.png';
import chinese from './assets/club-chinese.png';
import english from './assets/club-english.png';
import programming from './assets/club-programming.png';
import project from './assets/club-project.png';
import robotics from './assets/club-robotics.png';
import speaking from './assets/club-speaking.png';

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

/**
 * Картинка кружка (зелёный набор режима родителя; круги «Выполненные задания» и карточки
 * «Кружки для ваших детей»). Как и у ученика, языки и «прочее» уточняются по названию
 * (китайский, ораторское искусство, проектная деятельность); категории без своей картинки
 * (математика, музыка, спорт, прочее) получают «проектную».
 */
export function clubArt({ title, category }: Pick<ClubBrief, 'title' | 'category'>): string {
  const name = title.toLowerCase();
  if (name.includes('китай')) return chinese;
  if (name.includes('оратор') || name.includes('публичн')) return speaking;
  if (name.includes('проект')) return project;
  switch (category) {
    case 'ROBOTICS':
      return robotics;
    case 'CHESS':
      return chess;
    case 'PROGRAMMING':
      return programming;
    case 'LANGUAGES':
      return english;
    case 'ART':
      return art;
    default:
      return project;
  }
}
