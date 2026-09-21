import { Badge, Card, Chip, Inline, ListRow, Screen, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { LessonCard } from '@/entities/lesson';
import { StudentRow, useTeacherStudent } from '@/entities/student';
import { formatDateTime } from '@/shared/lib/dates';
import { formatScore, fullName } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';
import { AiTextCard } from '@/widgets/ai-text-card';
import { ClubProgressList } from '@/widgets/club-progress-list';
import { StatsTiles } from '@/widgets/stats-tiles';

/** `/teacher/students/:studentId` — `GET /teacher/students/:id`. */
export function StudentCardPage() {
  const { studentId = '' } = useParams();
  const { t, i18n } = useTranslation('teacher');
  const query = useTeacherStudent(studentId);

  return (
    <>
      <ScreenHeader
        title={query.data ? fullName(query.data.student.user) : t('students.title')}
        back
      />
      <Screen>
        <AsyncState query={query}>
          {(card) => (
            <>
              <Card padding="none">
                <StudentRow
                  student={card.student}
                  subtitle={card.groups.map((group) => group.title).join(', ')}
                />
              </Card>

              {card.needsAttention.length > 0 && (
                <Inline>
                  {card.needsAttention.map((reason) => (
                    <Badge key={reason} tone="warning">
                      {reason}
                    </Badge>
                  ))}
                </Inline>
              )}

              <StatsTiles stats={card.stats} />

              {card.clubs.length > 0 && <ClubProgressList clubs={card.clubs} />}

              {card.history.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('students.history')}</SectionTitle>
                  <Card padding="none">
                    {card.history.map((item) => (
                      <ListRow
                        key={item.assignment.id}
                        title={item.assignment.title}
                        subtitle={formatDateTime(item.submittedAt, i18n.language)}
                        right={
                          <Badge
                            tone={item.score == null ? 'info' : item.isLate ? 'warning' : 'success'}
                          >
                            {formatScore(item.score, item.assignment.maxScore)}
                          </Badge>
                        }
                      />
                    ))}
                  </Card>
                </Stack>
              )}

              {card.attendanceHistory.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('students.attendanceHistory')}</SectionTitle>
                  <Card padding="none">
                    {card.attendanceHistory.map((item) => (
                      <LessonCard
                        key={item.lesson.id}
                        lesson={{ ...item.lesson, attendance: item.status }}
                      />
                    ))}
                  </Card>
                </Stack>
              )}

              {card.weekly.length > 0 && (
                <Inline>
                  {card.weekly.map((point) => (
                    <Chip key={point.weekStart} disabled>
                      {point.weekStart}: {point.activityScore}
                    </Chip>
                  ))}
                </Inline>
              )}

              <AiTextCard title={t('students.aiSummary')} value={card.aiSummary} />
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
