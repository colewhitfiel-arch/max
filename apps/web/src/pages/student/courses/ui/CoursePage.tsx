import { BLOCK_TYPE_META } from '@edu/contracts';
import { Badge, Card, ListRow, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useStudentCourse } from '@/entities/course';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/student/courses/:courseId` — структура курса с прогрессом по блокам. */
export function CoursePage() {
  const { courseId = '' } = useParams();
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const query = useStudentCourse(courseId);
  return (
    <>
      <ScreenHeader title={query.data?.title ?? t('courses.title')} back="/student/courses" />
      <Screen>
        <AsyncState query={query}>
          {(course) => (
            <>
              {course.description && <Text tone="muted">{course.description}</Text>}
              <Text variant="caption" tone="muted">
                {course.group.title}
              </Text>
              {course.modules.map((module) => (
                <Stack key={module.id} gap={2}>
                  <SectionTitle>{module.title}</SectionTitle>
                  <Card padding="none">
                    {module.blocks.map((block) => (
                      <ListRow
                        key={block.id}
                        title={block.title}
                        subtitle={[
                          BLOCK_TYPE_META[block.type].label,
                          block.estimatedMinutes
                            ? t('courses.minutes', { count: block.estimatedMinutes })
                            : null,
                          block.isRequired ? t('courses.required') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        right={
                          block.progress === 'COMPLETED' ? (
                            <Badge tone="success">✓</Badge>
                          ) : block.progress === 'OPENED' ? (
                            <Badge tone="info">…</Badge>
                          ) : undefined
                        }
                        onClick={() => navigate(`/student/blocks/${block.id}`)}
                      />
                    ))}
                  </Card>
                </Stack>
              ))}
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
