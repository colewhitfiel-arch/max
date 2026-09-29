import type { ClubCategory } from '@edu/contracts';
import { Badge, Card, ListRow } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import type { ClubIconSet } from '../icons';
import { ClubIcon } from './ClubIcon';

export interface ClubPickListProps {
  /** Кружки в порядке показа. */
  categories: readonly ClubCategory[];
  selected: readonly ClubCategory[];
  onToggle: (category: ClubCategory) => void;
  /** Набор иконок режима; по умолчанию синий. */
  set?: ClubIconSet;
  'aria-label'?: string;
}

/**
 * Список кружков с иконками для выбора: отмеченные — с галочкой (`aria-pressed`). Один выбор или
 * несколько — решает `onToggle` экрана.
 */
export function ClubPickList({
  categories,
  selected,
  onToggle,
  set,
  'aria-label': ariaLabel,
}: ClubPickListProps) {
  const { t } = useTranslation('common');
  return (
    <Card padding="none" role="group" aria-label={ariaLabel}>
      {categories.map((category) => {
        const title = t(`clubCategory.${category}`);
        const isSelected = selected.includes(category);
        return (
          <ListRow
            key={category}
            left={<ClubIcon category={category} title={title} set={set} />}
            title={title}
            right={isSelected ? <Badge tone="success">✓</Badge> : undefined}
            chevron={false}
            onClick={() => onToggle(category)}
            aria-pressed={isSelected}
          />
        );
      })}
    </Card>
  );
}
