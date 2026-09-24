import { Badge, Button, Card, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useStudentAssignment } from '@/entities/assignment';
import { formatDue } from '@/shared/lib/dates';
import { formatScore } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/student/assignments/:assignmentId` — `GET /student/assignments/:id` (сдача — задача W2). */
export function AssignmentPage() {
  const { assignmentId = '' } = useParams();
  const { t, i18n } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const query = useStudentAssignment(assignmentId);
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

              <Stack gap={2}>
                <SectionTitle>{t('assignments.submission')}</SectionTitle>
                <Card>
                  {assignment.submission ? (
                    <Stack gap={2}>
                      <Badge tone={assignment.submission.status === 'GRADED' ? 'success' : 'info'}>
                        {tc(`assignment.status.${assignment.submission.status}`)}
                      </Badge>
                      <Text>{formatScore(assignment.submission.score, assignment.maxScore)}</Text>
                      {assignment.submission.text && (
                        <Text tone="muted">{assignment.submission.text}</Text>
                      )}
                      {assignment.submission.feedback && (
                        <Text variant="caption">
                          {t('assignments.feedback')}: {assignment.submission.feedback}
                        </Text>
                      )}
                    </Stack>
                  ) : (
                    <Text tone="muted">{t('assignments.notSubmitted')}</Text>
                  )}
                  {assignment.attemptsLeft != null && (
                    <Text variant="caption" tone="muted">
                      {t('assignments.attemptsLeft', { count: assignment.attemptsLeft })}
                    </Text>
                  )}
                </Card>
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
