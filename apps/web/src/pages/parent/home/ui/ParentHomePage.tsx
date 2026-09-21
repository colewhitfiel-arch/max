import { Card, EmptyState, Inline, Screen, Stack, StatTile } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { AssignmentCard } from '@/entities/assignment';
import { LessonCard } from '@/entities/lesson';
import { useParentHome } from '@/entities/student';
import { formatDelta, fullName } from '@/shared/lib/format';
import { useSelectedChildId } from '@/shared/store/ui-store';
import { AsyncState, DashboardSkeleton, ScreenHeader, SectionTitle } from '@/shared/ui';
import { AiTextCard } from '@/widgets/ai-text-card';
import { StatsTiles } from '@/widgets/stats-tiles';

/** `/parent` — `GET /parent/children/:studentId/home` для выбранного ребёнка (F9). */
export function ParentHomePage() {
  const { t } = useTranslation('parent');
  const studentId = useSelectedChildId();
  const query = useParentHome(studentId);

  return (
    <>
      <ScreenHeader title={t('home.title')} bell />
      <Screen>
        <AsyncState query={query} skeleton={<DashboardSkeleton />}>
          {(home) => (
            <>
              <SectionTitle>{fullName(home.student.user)}</SectionTitle>
              <StatsTiles stats={home.stats} />
              <Inline gap={2} align="stretch">
                <StatTile
                  label={`${t('home.trend')} · ${t('analytics.title').toLowerCase()}`}
                  value={formatDelta(home.trend.attendanceDelta)}
                  tone={(home.trend.attendanceDelta ?? 0) >= 0 ? 'success' : 'danger'}
                  style={{ flex: 1 }}
                />
                <StatTile
                  label={t('home.trend')}
                  value={formatDelta(home.trend.completionDelta)}
                  tone={(home.trend.completionDelta ?? 0) >= 0 ? 'success' : 'danger'}
                  style={{ flex: 1 }}
                />
              </Inline>

              <Stack gap={2}>
                <SectionTitle>{t('home.today')}</SectionTitle>
                {home.today.length === 0 ? (
                  <Card>
                    <EmptyState title={t('home.noLessonsToday')} />
                  </Card>
                ) : (
                  <Card padding="none">
                    {home.today.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} withDate={false} />
                    ))}
                  </Card>
                )}
              </Stack>

              {home.upcoming.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('home.upcoming')}</SectionTitle>
                  <Card padding="none">
                    {home.upcoming.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} />
                    ))}
                  </Card>
                </Stack>
              )}

              {home.missed.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('home.missed')}</SectionTitle>
                  <Card padding="none">
                    {home.missed.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} />
                    ))}
                  </Card>
                </Stack>
              )}

              {home.newAssignments.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('home.newAssignments')}</SectionTitle>
                  <Card padding="none">
                    {home.newAssignments.map((assignment) => (
                      <AssignmentCard key={assignment.id} assignment={assignment} />
                    ))}
                  </Card>
                </Stack>
              )}

              {home.overdue.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('home.overdue')}</SectionTitle>
                  <Card padding="none">
                    {home.overdue.map((assignment) => (
                      <AssignmentCard key={assignment.id} assignment={assignment} />
                    ))}
                  </Card>
                </Stack>
              )}

              <AiTextCard title={t('home.aiSummary')} value={home.aiSummary} />
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
