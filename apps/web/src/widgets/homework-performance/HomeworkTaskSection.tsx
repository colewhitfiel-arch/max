import type { HomeworkTaskDetail } from '@edu/contracts';
import { Band, CodeBlock, Stack, Text, useToast } from '@edu/ui';
import { forwardRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/shared/lib/dates';

export interface HomeworkTaskSectionProps {
  task: HomeworkTaskDetail;
  /**
   * Уровень заголовка «Задание N». По умолчанию `h2` (у родителя `h1` — название кружка);
   * `h3` — когда над заданиями есть свой `h2` (полоса курса у преподавателя).
   */
  titleAs?: 'h2' | 'h3';
}

/** Строки результата под условием: цвет и текст зависят от статуса задания. */
function TaskResult({ task }: Pick<HomeworkTaskSectionProps, 'task'>) {
  const { t, i18n } = useTranslation('performance');
  const due = (value: string) => formatDateTime(value, i18n.language);

  switch (task.status) {
    case 'DONE':
      return (
        <Stack gap={1}>
          {task.answer != null && (
            <Text variant="caption" as="p" tone="success">
              {t('taskDetail.answer', { answer: task.answer })}
            </Text>
          )}
          <Text variant="caption" as="p" tone={task.score == null ? 'muted' : 'success'}>
            {task.score == null
              ? t('taskDetail.pendingReview')
              : t('taskDetail.score', { score: task.score, max: task.maxScore })}
          </Text>
        </Stack>
      );
    case 'FAILED':
      // Сдано, но ниже порога — ответ и эталон; не сдано к сроку — дата истечения.
      return (
        <Stack gap={1}>
          {task.answer != null ? (
            <Text variant="caption" as="p" tone="danger">
              {t('taskDetail.answer', { answer: task.answer })}
            </Text>
          ) : (
            <Text variant="caption" as="p" tone="danger">
              {task.dueAt
                ? t('taskDetail.notSubmitted', { date: due(task.dueAt) })
                : t('status.FAILED_OVERDUE')}
            </Text>
          )}
          {task.correctAnswer != null && (
            <Text variant="caption" as="p" tone="success">
              {t('taskDetail.correctAnswer', { answer: task.correctAnswer })}
            </Text>
          )}
          {task.score != null && (
            <Text variant="caption" as="p" tone="muted">
              {t('taskDetail.score', { score: task.score, max: task.maxScore })}
            </Text>
          )}
        </Stack>
      );
    case 'SOON':
    case 'LATER': {
      const tone = task.status === 'SOON' ? 'warning' : 'muted';
      return (
        <Stack gap={1}>
          <Text variant="caption" as="p" tone={tone}>
            {t('taskDetail.upcoming')}
          </Text>
          <Text variant="caption" as="p" tone={tone}>
            {task.dueAt ? t('taskDetail.due', { date: due(task.dueAt) }) : t('taskDetail.noDue')}
          </Text>
        </Stack>
      );
    }
  }
}

/**
 * Задание на экране подробностей: «Задание N», условие, код с подсветкой и результат
 * (ответ / правильный ответ / «Предстоит выполнить»). Полупрозрачная полоса на всю ширину.
 * Общий для подробностей заданий у родителя и у преподавателя.
 */
export const HomeworkTaskSection = forwardRef<HTMLElement, HomeworkTaskSectionProps>(
  function HomeworkTaskSection({ task, titleAs = 'h2' }, ref) {
    const { t } = useTranslation('performance');
    const toast = useToast();
    const titleId = useId();

    return (
      <Band as="section" ref={ref} aria-labelledby={titleId}>
        <Stack gap={3}>
          <Text as={titleAs} id={titleId} variant="body" weight="medium">
            {t('taskDetail.title', { number: task.number })}
          </Text>
          <Text variant="caption" as="p">
            {task.statement}
          </Text>
          {task.code && (
            <CodeBlock
              code={task.code.source}
              language={task.code.language}
              copyLabel={t('taskDetail.copy')}
              copiedLabel={t('taskDetail.copied')}
              onCopyResult={(ok) => {
                if (!ok) toast.show({ tone: 'danger', title: t('taskDetail.copyFailed') });
              }}
            />
          )}
          <TaskResult task={task} />
        </Stack>
      </Band>
    );
  },
);
