import { Button, Card, EmptyState, Screen, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AssignmentCard } from '@/entities/assignment';
import { useStudentHome } from '@/entities/dashboard';
import { LessonCard } from '@/entities/lesson';
import { AsyncState, DashboardSkeleton, ScreenHeader, SectionTitle } from '@/shared/ui';
import { AiTextCard } from '@/widgets/ai-text-card';
import { ClubProgressList } from '@/widgets/club-progress-list';
import { StatsTiles } from '@/widgets/stats-tiles';

/** `/student` — `GET /student/home` (F2). */
export function StudentHomePage() {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const query = useStudentHome();

  return (
    <>
      <ScreenHeader title={t('home.title')} bell />
      <Screen>
        <AsyncState query={query} skeleton={<DashboardSkeleton />}>
          {(home) => (
            <>
              <StatsTiles stats={home.stats} />

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

              <Stack gap={2}>
                <SectionTitle
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/student/assignments')}
                    >
                      {t('home.allTasks')}
                    </Button>
                  }
                >
                  {t('home.tasks')}
                </SectionTitle>
                {home.tasks.length === 0 ? (
                  <Card>
                    <EmptyState title={t('home.noTasks')} />
                  </Card>
                ) : (
                  <Card padding="none">
                    {home.tasks.map((task) => (
                      <AssignmentCard
                        key={task.id}
                        assignment={task}
                        onClick={() => navigate(`/student/assignments/${task.id}`)}
                      />
                    ))}
                  </Card>
                )}
              </Stack>

              {home.clubs.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('home.clubs')}</SectionTitle>
                  <ClubProgressList clubs={home.clubs} />
                </Stack>
              )}

              <AiTextCard title={t('home.aiComment')} value={home.aiComment} />
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
