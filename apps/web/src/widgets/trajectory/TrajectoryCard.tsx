import type { TrajectoryDto } from '@edu/contracts';
import { Card, Divider, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/shared/lib/dates';

export interface TrajectoryCardProps {
  trajectory: TrajectoryDto;
}

/** «Моя траектория» (F5): итог, сильные стороны, зоны роста, рекомендации ИИ и шаги на неделю. */
export function TrajectoryCard({ trajectory }: TrajectoryCardProps) {
  const { t, i18n } = useTranslation('student');
  const { content } = trajectory;
  return (
    <Card>
      <Stack gap={3}>
        <Text>{content.summary}</Text>
        {content.strengths.length > 0 && (
          <Text variant="caption" weight="medium">
            {t('profile.strengths')}: {content.strengths.join(', ')}
          </Text>
        )}
        {content.growthAreas.length > 0 && (
          <Text variant="caption" weight="medium">
            {t('profile.growth')}: {content.growthAreas.join(', ')}
          </Text>
        )}
        {content.recommendations.length > 0 && (
          <>
            <Divider />
            <Stack gap={2}>
              <Text variant="caption" weight="medium">
                {t('profile.recommendations')}
              </Text>
              {content.recommendations.map((item, index) => (
                <Stack key={`${item.title}-${index}`} gap={0}>
                  <Text weight="medium">{item.title}</Text>
                  <Text variant="caption" tone="muted">
                    {item.why}
                  </Text>
                </Stack>
              ))}
            </Stack>
          </>
        )}
        {content.nextSteps.length > 0 && (
          <Text variant="caption" weight="medium">
            {t('profile.nextSteps')}: {content.nextSteps.join('; ')}
          </Text>
        )}
        <Text variant="caption" tone="muted">
          {t('profile.trajectoryUpdated', {
            date: formatDate(trajectory.generatedAt, i18n.language),
          })}
        </Text>
      </Stack>
    </Card>
  );
}
