import type { StudentBlockDetail } from '@edu/contracts';
import { Badge, Button, Card, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useStudentAssignment } from '@/entities/assignment';
import { BlockContent, useStudentBlock } from '@/entities/course';
import { SubmitAssignmentForm } from '@/features/submit-assignment';
import { formatDue } from '@/shared/lib/dates';
import { formatScore } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/**
 * `/student/assignments/:assignmentId` — задание целиком: условие из блока курса,
 * форма сдачи и результат проверки (docs/07 F7). Сюда ведёт тап по планете на «Заданиях».
 */
export function AssignmentPage() {
  const { assignmentId = '' } = useParams();
  const { t, i18n } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const query = useStudentAssignment(assignmentId);
  const blockId = query.data?.block?.id;
  // Условие задания живёт в блоке курса; у «простого» задания блока нет — запрос не идёт.
  const blockQuery = useStudentBlock(blockId ?? '', { enabled: !!blockId });
  const block: StudentBlockDetail | null = blockQuery.data ?? null;

  return (
    <>
      <ScreenHeader title={query.data?.title ?? t('assignments.title')} back />
      <Screen>
        <AsyncState query={query}>
          {(assignment) => (
            <>
              <Stack gap={1}>
                <Text variant="caption" tone="muted">
                  {assignment.group.club.title} · {tc(`assignment.type.${assignment.type}`)}
                </Text>
                <Text variant="caption">
                  {assignment.dueAt
                    ? `${tc('assignment.due')}: ${formatDue(assignment.dueAt, i18n.language)}`
                    : tc('assignment.noDue')}
                </Text>
              </Stack>

              {assignment.description && (
                <Stack gap={2}>
                  <SectionTitle>{t('assignments.description')}</SectionTitle>
                  <Card>
                    <Text preserveLines>{assignment.description}</Text>
                  </Card>
                </Stack>
              )}

              {/* У теста вопросы показывает сама форма ответа — иначе они задвоятся. */}
              {block && block.type !== 'QUIZ' && (
                <Stack gap={2}>
                  <SectionTitle>{t('assignments.task')}</SectionTitle>
                  <BlockContent block={block} card />
                </Stack>
              )}

              {assignment.submission && (
                <Stack gap={2}>
                  <SectionTitle>{t('assignments.submission')}</SectionTitle>
                  <Card>
                    <Stack gap={2}>
                      <Badge tone={assignment.submission.status === 'GRADED' ? 'success' : 'info'}>
                        {tc(`assignment.status.${assignment.submission.status}`)}
                      </Badge>
                      <Text>{formatScore(assignment.submission.score, assignment.maxScore)}</Text>
                      {assignment.submission.text && (
                        <Text tone="muted" preserveLines>
                          {assignment.submission.text}
                        </Text>
                      )}
                      {assignment.submission.feedback && (
                        <Text variant="caption">
                          {t('assignments.feedback')}: {assignment.submission.feedback}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </Stack>
              )}

              <Stack gap={2}>
                <SectionTitle>
                  {assignment.submission ? t('assignments.resubmitTitle') : t('assignments.answer')}
                </SectionTitle>
                <SubmitAssignmentForm assignment={assignment} block={block} />
              </Stack>

              {assignment.block && (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => navigate(`/student/blocks/${assignment.block!.id}`)}
                >
                  {t('courses.openInCourse')}
                </Button>
              )}
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
