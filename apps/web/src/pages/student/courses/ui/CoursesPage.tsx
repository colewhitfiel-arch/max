import { EmptyState, Screen, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CourseCard, useStudentCourses } from '@/entities/course';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** `/student/courses` — `GET /student/courses` (F3). */
export function CoursesPage() {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const query = useStudentCourses();
  return (
    <>
      <ScreenHeader title={t('courses.title')} bell />
      <Screen>
        <AsyncState
          query={query}
          isEmpty={(list) => list.items.length === 0}
          empty={<EmptyState title={t('courses.empty')} description={t('courses.emptyHint')} />}
        >
          {(list) => (
            <Stack gap={3}>
              {list.items.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onClick={() => navigate(`/student/courses/${course.id}`)}
                />
              ))}
            </Stack>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
