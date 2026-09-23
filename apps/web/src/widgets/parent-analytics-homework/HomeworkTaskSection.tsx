import type { HomeworkTaskDetail } from '@edu/contracts';
import { Band, CodeBlock, Stack, Text, useToast } from '@edu/ui';
import { forwardRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/shared/lib/dates';

export interface HomeworkTaskSectionProps {
  task: HomeworkTaskDetail;
}

/** Строки результата под условием: цвет и текст зависят от статуса задания. */
function TaskResult({ task }: HomeworkTaskSectionProps) {
  const { t, i18n } = useTranslation('parent-analytics');
  const due = (value: string) => formatDateTime(value, i18n.language);

  switch (task.status) {
    case 'DONE':
      return (
        <Stack gap={1}>
          {task.answer != null && (
            <Text variant="caption" as="p" tone="success">
              {t('task.answer', { answer: task.answer })}
            </Text>
          )}
          <Text variant="caption" as="p" tone={task.score == null ? 'muted' : 'success'}>
            {task.score == null
              ? t('task.pendingReview')
              : t('task.score', { score: task.score, max: task.maxScore })}
          </Text>
        </Stack>
      );
    case 'FAILED':
      // Сдано, но меньше 30% — ответ и эталон; не сдано к сроку — дата истечения.
      return (
        <Stack gap={1}>
          {task.answer != null ? (
            <Text variant="caption" as="p" tone="danger">
              {t('task.answer', { answer: task.answer })}
            </Text>
          ) : (
            <Text variant="caption" as="p" tone="danger">
              {task.dueAt
                ? t('task.notSubmitted', { date: due(task.dueAt) })
                : t('status.FAILED_OVERDUE')}
            </Text>
          )}
          {task.correctAnswer != null && (
            <Text variant="caption" as="p" tone="success">
              {t('task.correctAnswer', { answer: task.correctAnswer })}
            </Text>
          )}
          {task.score != null && (
            <Text variant="caption" as="p" tone="muted">
              {t('task.score', { score: task.score, max: task.maxScore })}
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
            {t('task.upcoming')}
          </Text>
          <Text variant="caption" as="p" tone={tone}>
            {task.dueAt ? t('task.due', { date: due(task.dueAt) }) : t('task.noDue')}
          </Text>
        </Stack>
      );
    }
  }
}

/**
 * Задание на экране подробностей: «Задание N», условие, код с подсветкой и результат
 * (ответ / правильный ответ / «Предстоит выполнить»). Полупрозрачная полоса на всю ширину.
 */
export const HomeworkTaskSection = forwardRef<HTMLElement, HomeworkTaskSectionProps>(
  function HomeworkTaskSection({ task }, ref) {
    const { t } = useTranslation('parent-analytics');
    const toast = useToast();
    const titleId = useId();

    return (
      <Band as="section" ref={ref} aria-labelledby={titleId}>
        <Stack gap={3}>
          <Text as="h2" id={titleId} variant="body" weight="medium">
            {t('task.title', { number: task.number })}
          </Text>
          <Text variant="caption" as="p">
            {task.statement}
          </Text>
          {task.code && (
            <CodeBlock
              code={task.code.source}
              language={task.code.language}
              copyLabel={t('task.copy')}
              copiedLabel={t('task.copied')}
              onCopyResult={(ok) => {
                if (!ok) toast.show({ tone: 'danger', title: t('task.copyFailed') });
              }}
            />
          )}
          <TaskResult task={task} />
        </Stack>
      </Band>
    );
  },
);
