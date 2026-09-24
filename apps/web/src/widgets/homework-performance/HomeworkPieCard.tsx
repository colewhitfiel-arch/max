import type { HomeworkCounts } from '@edu/contracts';
import { Card, PieChart, Stack, Text } from '@edu/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface HomeworkPieCardProps {
  counts: HomeworkCounts;
}

/**
 * «Домашние задачи»: заголовок над карточкой с круговой диаграммой по макету — «Правильно»
 * выдвинут (зелёный), «Неправильно» красный, «Предстоят» жёлтый; легенда слева.
 */
export function HomeworkPieCard({ counts }: HomeworkPieCardProps) {
  const { t } = useTranslation('performance');
  const titleId = useId();
  return (
    <Stack as="section" gap={2} aria-labelledby={titleId}>
      <Text as="h2" id={titleId} variant="small" weight="bold" align="center">
        {t('homework.title')}
      </Text>
      <Card>
        <PieChart
          aria-label={t('homework.pieLabel', { ...counts })}
          slices={[
            { key: 'correct', value: counts.correct, tone: 'success', explode: true },
            { key: 'wrong', value: counts.wrong, tone: 'danger' },
            { key: 'upcoming', value: counts.upcoming, tone: 'warning' },
          ]}
          legend={[
            { tone: 'success', label: t('counts.correct') },
            { tone: 'danger', label: t('counts.wrong') },
            { tone: 'warning', label: t('counts.upcoming') },
          ]}
        />
      </Card>
    </Stack>
  );
}
