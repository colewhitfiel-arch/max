import type { ClubHomework } from '@edu/contracts';
import { Band, Button, Inline, SegmentBar, Stack, StatusGrid, Text } from '@edu/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_FAIL_PERCENT, TONE_BY_TASK_STATUS, taskStatusLabelKey } from './task-status';

export interface ClubHomeworkBandProps {
  item: ClubHomework;
  /** Раскрыта ли сетка заданий («Подробнее» / «Скрыть»). */
  expanded: boolean;
  onToggle: () => void;
  /** Нажатие на клетку задания → экран подробностей. */
  onSelectTask: (assignmentId: string) => void;
  /** Порог «правильно» в процентах для подписи красной клетки: родитель 30, ученик 75. */
  failPercent?: number;
}

/**
 * Полоса кружка на экране успеваемости: название, итоговая полоса (правильно / предстоят /
 * неправильно) и раскрываемая сетка заданий, окрашенных по статусу (docs/04 §4.6). Общий для
 * успеваемости ребёнка у родителя и профиля ученика; порог «правильно» — `failPercent`.
 */
export function ClubHomeworkBand({
  item,
  expanded,
  onToggle,
  onSelectTask,
  failPercent = DEFAULT_FAIL_PERCENT,
}: ClubHomeworkBandProps) {
  const { t } = useTranslation('performance');
  const titleId = useId();
  const gridId = useId();
  const club = item.club.title;

  return (
    <Band as="section" aria-labelledby={titleId}>
      <Stack gap={2}>
        <Text as="h3" id={titleId} variant="small" weight="bold">
          {club}
        </Text>
        <SegmentBar
          aria-label={t('club.barLabel', { club })}
          segments={[
            {
              key: 'correct',
              value: item.counts.correct,
              tone: 'success',
              label: t('counts.correct'),
            },
            {
              key: 'upcoming',
              value: item.counts.upcoming,
              tone: 'warning',
              label: t('counts.upcoming'),
            },
            { key: 'wrong', value: item.counts.wrong, tone: 'danger', label: t('counts.wrong') },
          ]}
        />
        {item.tasks.length > 0 && (
          <Inline>
            <Button
              variant="link"
              underline={expanded}
              aria-expanded={expanded}
              aria-controls={expanded ? gridId : undefined}
              onClick={onToggle}
            >
              {expanded ? t('club.hide') : t('club.more')}
            </Button>
          </Inline>
        )}
        {expanded && item.tasks.length > 0 && (
          <StatusGrid
            id={gridId}
            aria-label={t('club.gridLabel', { club })}
            onSelect={onSelectTask}
            items={item.tasks.map((task) => ({
              key: task.assignmentId,
              label: task.number,
              tone: TONE_BY_TASK_STATUS[task.status],
              title: t('task.cell', {
                number: task.number,
                status: t(`status.${taskStatusLabelKey(task)}`, { percent: failPercent }),
              }),
            }))}
          />
        )}
      </Stack>
    </Band>
  );
}
