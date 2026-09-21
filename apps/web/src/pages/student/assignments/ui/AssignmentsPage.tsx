import { EmptyState, Screen, Stack, Text, VisuallyHidden } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStudentHomework } from '@/entities/assignment';
import { AsyncState, DashboardSkeleton } from '@/shared/ui';
import { HomeworkMap } from '@/widgets/homework-map';
import { HomeworkRecommendations } from '@/widgets/homework-recommendations';
import { StudentHomeStats } from '@/widgets/student-home-stats';

/**
 * `/student/assignments` — экран «Задания» по макету Figma: серия/баллы, «Рекомендации на
 * сегодня» (кружки с открытыми заданиями) и карта планет по кружкам. Данные — `GET /student/homework`.
 * Тап по планете открывает ближайшее задание кружка.
 */
export function AssignmentsPage() {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const query = useStudentHomework();

  return (
    <Screen gap={6} fill>
      <VisuallyHidden as="h1">{t('homework.title')}</VisuallyHidden>
      <AsyncState
        query={query}
        skeleton={<DashboardSkeleton />}
        isEmpty={(homework) => homework.clubs.length === 0}
        empty={<EmptyState title={t('homework.empty')} description={t('homework.emptyHint')} />}
      >
        {(homework) => (
          <>
            <StudentHomeStats streakDays={homework.streakDays} points={homework.points} />
            <Stack gap={5}>
              <Text variant="title">{t('homework.recommendations')}</Text>
              <HomeworkRecommendations clubs={homework.clubs} />
            </Stack>
            <HomeworkMap
              clubs={homework.clubs}
              onOpenAssignment={(id) => navigate(`/student/assignments/${id}`)}
            />
          </>
        )}
      </AsyncState>
    </Screen>
  );
}
