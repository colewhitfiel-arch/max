import { Badge, Card, EmptyState, Inline, ListRow, Screen, Stack, StatTile } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AssignmentCard } from '@/entities/assignment';
import { useTeacherHome } from '@/entities/dashboard';
import { LessonCard } from '@/entities/lesson';
import { NotificationRow } from '@/entities/notification';
import { formatRate } from '@/shared/lib/format';
import { AsyncState, DashboardSkeleton, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/teacher` — `GET /teacher/home` (F6/F7). */
export function TeacherHomePage() {
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const query = useTeacherHome();

  return (
    <>
      <ScreenHeader title={t('home.title')} bell />
      <Screen>
        <AsyncState query={query} skeleton={<DashboardSkeleton />}>
          {(home) => (
            <>
              <Inline gap={2} align="stretch">
                <StatTile
                  label={t('home.stats.groups')}
                  value={String(home.stats.groupsCount)}
                  style={{ flex: 1 }}
                />
                <StatTile
                  label={t('home.stats.students')}
                  value={String(home.stats.studentsCount)}
                  style={{ flex: 1 }}
                />
                <StatTile
                  label={t('home.stats.attendance')}
                  value={formatRate(home.stats.avgAttendanceRate, i18n.language)}
                  tone="success"
                  style={{ flex: 1 }}
                />
                <StatTile
                  label={t('home.stats.needsAttention')}
                  value={String(home.stats.needsAttentionCount)}
                  tone={home.stats.needsAttentionCount > 0 ? 'warning' : 'neutral'}
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
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        withDate={false}
                        onClick={() => navigate(`/teacher/groups/${lesson.group.id}`)}
                      />
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

              <Stack gap={2}>
                <SectionTitle>{t('home.groups')}</SectionTitle>
                <Card padding="none">
                  {home.groups.map((group) => (
                    <ListRow
                      key={group.id}
                      title={group.title}
                      subtitle={`${t('groups.students', { count: group.studentsCount })} · ${formatRate(group.attendanceRate, i18n.language)}`}
                      right={
                        group.needsAttentionCount > 0 ? (
                          <Badge tone="warning">{group.needsAttentionCount}</Badge>
                        ) : undefined
                      }
                      onClick={() => navigate(`/teacher/groups/${group.id}`)}
                    />
                  ))}
                </Card>
              </Stack>

              <Stack gap={2}>
                <SectionTitle>{t('home.toGrade')}</SectionTitle>
                {home.toGrade.length === 0 ? (
                  <Card>
                    <EmptyState title={t('home.nothingToGrade')} />
                  </Card>
                ) : (
                  <Card padding="none">
                    {home.toGrade.map((item) => (
                      <AssignmentCard
                        key={item.assignment.id}
                        assignment={item.assignment}
                        right={
                          <Badge tone="info">
                            {t('home.pending', { count: item.pendingCount })}
                          </Badge>
                        }
                        onClick={() => navigate('/teacher/assignments')}
                      />
                    ))}
                  </Card>
                )}
              </Stack>

              {home.events.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('home.events')}</SectionTitle>
                  <Card padding="none">
                    {home.events.map((event) => (
                      <NotificationRow key={event.id} notification={event} />
                    ))}
                  </Card>
                </Stack>
              )}
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
