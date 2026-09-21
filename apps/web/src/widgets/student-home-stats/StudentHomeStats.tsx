import { FireIcon, GemIcon, Inline, Text } from '@edu/ui';
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
        <Inline gap={1} wrap={false} aria-label={t('home.streak', { count: streakDays })}>
          <Text as="span" tone="warning">
            <FireIcon />
          </Text>
          <Text as="span" weight="medium">
            {streakDays}
          </Text>
        </Inline>
      )}
      {points !== undefined && (
        <Inline gap={1} wrap={false} aria-label={t('home.points', { count: points })}>
          <Text as="span" tone="primary">
            <GemIcon />
          </Text>
          <Text as="span" weight="medium">
            {points}
          </Text>
        </Inline>
      )}
    </Inline>
  );
}
