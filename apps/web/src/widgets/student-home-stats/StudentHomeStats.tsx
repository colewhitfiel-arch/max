import { FireIcon, GemIcon, Inline, Text, VisuallyHidden } from '@edu/ui';
import { useTranslation } from 'react-i18next';

export interface StudentHomeStatsProps {
  streakDays?: number;
  points?: number;
}

/** Шапка главной: серия дней (огонь) и баллы (кристалл). Без данных — не рендерится. */
export function StudentHomeStats({ streakDays, points }: StudentHomeStatsProps) {
  const { t } = useTranslation('student');
  if (streakDays === undefined && points === undefined) return null;
  return (
    <Inline gap={5} justify="center" wrap={false}>
      {streakDays !== undefined && (
        <Inline gap={1} wrap={false}>
          <VisuallyHidden>{t('home.streak', { count: streakDays })}</VisuallyHidden>
          <Text as="span" tone="warning" aria-hidden="true">
            <FireIcon />
          </Text>
          <Text as="span" weight="medium" aria-hidden="true">
            {streakDays}
          </Text>
        </Inline>
      )}
      {points !== undefined && (
        <Inline gap={1} wrap={false}>
          <VisuallyHidden>{t('home.points', { count: points })}</VisuallyHidden>
          <Text as="span" tone="primary" aria-hidden="true">
            <GemIcon />
          </Text>
          <Text as="span" weight="medium" aria-hidden="true">
            {points}
          </Text>
        </Inline>
      )}
    </Inline>
  );
}
