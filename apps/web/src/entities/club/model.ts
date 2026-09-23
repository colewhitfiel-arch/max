import type { ClubCard } from '@edu/contracts';

/** Кружок на витрине родителя: карточка каталога + ходит ли уже выбранный ребёнок. */
export interface ClubOffer {
  club: ClubCard;
  enrolled: boolean;
}
