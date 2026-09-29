import type { ClubCategory } from '@edu/contracts';
import { Avatar, type AvatarProps } from '@edu/ui';
import { clubIcon, type ClubIconSet } from '../icons';

export interface ClubIconProps extends Omit<AvatarProps, 'src' | 'name'> {
  category: ClubCategory;
  /** Название кружка: из него инициалы, если картинка не загрузится. */
  title: string;
  /** Набор иконок режима; по умолчанию синий (ученик и преподаватель). */
  set?: ClubIconSet;
}

/**
 * Иконка кружка в строках списков и карточках — та же, что у кружка во всех режимах.
 * Декоративная: рядом всегда есть название, читалка экрана его и объявит.
 */
export function ClubIcon({ category, title, set = 'student', ...rest }: ClubIconProps) {
  return <Avatar name={title} src={clubIcon(category, set)} aria-hidden {...rest} />;
}
