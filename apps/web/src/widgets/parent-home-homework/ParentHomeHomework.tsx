import {
  HOMEWORK_PROGRESS_DAYS,
  HOMEWORK_PROGRESS_DEFAULT_DAYS,
  type HomeworkProgressDays,
} from '@edu/contracts';
import {
  EmptyState,
  Inline,
  ProgressBubble,
  ProgressBubbleGroup,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from '@edu/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clubIcon } from '@/entities/club';
import { useChildHomeworkProgress } from '@/entities/student';
import { QueryError } from '@/shared/ui';
import { bubbleSize } from './model';

export interface ParentHomeHomeworkProps {
  /** Выбранный ребёнок. */
  studentId: string;
}

const isProgressDays = (value: number): value is HomeworkProgressDays =>
  (HOMEWORK_PROGRESS_DAYS as readonly number[]).includes(value);

/**
 * «Выполненные задания» на главной родителя (макет): окно 1 / 7 / 30 дней, сноска про «*»,
 * круг на каждый кружок ребёнка — сделано / рекомендовано* за окно
 * (`GET /parent/children/:id/homework-progress`). Круги сжимаются по мере выполнения
 * (`bubbleSize`), смена окна или данных анимируется.
 */
export function ParentHomeHomework({ studentId }: ParentHomeHomeworkProps) {
  const { t } = useTranslation('parent-home');
  const titleId = useId();
  const [days, setDays] = useState<HomeworkProgressDays>(HOMEWORK_PROGRESS_DEFAULT_DAYS);
  const query = useChildHomeworkProgress(studentId, days);

  let content;
  if (query.isPending) {
    content = <Skeleton height={200} aria-busy="true" />;
  } else if (query.isError) {
    content = <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data.items.length === 0) {
    content = <EmptyState title={t('homework.empty')} />;
  } else {
    content = (
      <ProgressBubbleGroup aria-label={t('homework.list')} aria-busy={query.isPlaceholderData}>
        {query.data.items.map((item) => (
          <ProgressBubble
            key={item.group.id}
            size={bubbleSize(item.done, item.recommended)}
            title={item.club.title}
            image={clubIcon(item.club.category, 'parent')}
            value={item.done}
            suffix={`/${item.recommended}*`}
            aria-label={t('homework.bubble', {
              club: item.club.title,
              done: item.done,
              recommended: item.recommended,
            })}
          />
        ))}
      </ProgressBubbleGroup>
    );
  }

  return (
    <Stack gap={2} as="section" aria-labelledby={titleId} data-tour="parent-homework">
      <Inline justify="between" align="center" wrap={false} gap={2}>
        <Text id={titleId} as="h2" variant="caption" weight="bold">
          {t('homework.title')}
        </Text>
        <SegmentedControl
          aria-label={t('homework.period')}
          variant="accent"
          options={HOMEWORK_PROGRESS_DAYS.map((value) => ({
            value: String(value),
            label: t(`homework.days.${value}`),
          }))}
          value={String(days)}
          onChange={(value) => {
            const next = Number(value);
            if (isProgressDays(next)) setDays(next);
          }}
        />
      </Inline>
      <Text variant="caption" tone="muted" align="end" as="p">
        {t('homework.footnote')}
      </Text>
      {content}
    </Stack>
  );
}
