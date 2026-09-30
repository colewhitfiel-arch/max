import type { StudentBlockDetail } from '@edu/contracts';
import { Badge, Card, Skeleton, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useStudentAssignment } from '@/entities/assignment';
import { BlockContent } from '@/entities/course';
import { SubmitAssignmentForm } from '@/features/submit-assignment';
import { formatScore } from '@/shared/lib/format';
import { QueryError } from '@/shared/ui';

export interface TaskStepProps {
  block: StudentBlockDetail;
  assignmentId: string;
}

/**
 * Вопрос, практика или ДЗ в плеере курса: условие, статус сдачи и форма ответа прямо здесь.
 * Сдача засчитывает шаг курса сразу, оценку ставит преподаватель — она появится в статусе.
 */
export function TaskStep({ block, assignmentId }: TaskStepProps) {
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const query = useStudentAssignment(assignmentId);
  const assignment = query.data;
  const submission = assignment?.submission ?? null;

  return (
    <Stack gap={3}>
      <BlockContent block={block} card />
      {query.isPending && <Skeleton height={120} />}
      {query.isError && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {assignment && (
        <>
          {submission && (
            <Card>
              <Stack gap={1}>
                <Badge tone={submission.status === 'GRADED' ? 'success' : 'info'}>
                  {tc(`assignment.status.${submission.status}`)}
                </Badge>
                <Text variant="small">{formatScore(submission.score, assignment.maxScore)}</Text>
                {submission.feedback && (
                  <Text variant="caption">
                    {t('assignments.feedback')}: {submission.feedback}
                  </Text>
                )}
                {submission.status === 'SUBMITTED' && (
                  <Text variant="caption" tone="muted">
                    {t('player.task.waiting')}
                  </Text>
                )}
              </Stack>
            </Card>
          )}
          <Stack gap={2} data-tour="assignment-answer">
            {submission && <Text weight="medium">{t('assignments.resubmitTitle')}</Text>}
            <SubmitAssignmentForm assignment={assignment} block={block} />
          </Stack>
        </>
      )}
    </Stack>
  );
}
