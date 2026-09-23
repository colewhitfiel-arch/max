import { Badge, Card, EmptyState, ListRow, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useTeacherCourse } from '@/entities/course';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/teacher/courses/:courseId` — `GET /teacher/courses/:id` (редактор структуры — задача W10). */
export function TeacherCoursePage() {
  const { courseId = '' } = useParams();
  const { t } = useTranslation('teacher');
  const query = useTeacherCourse(courseId);
  return (
    <>
      <ScreenHeader title={query.data?.title ?? t('courses.title')} back="/teacher/courses" />
      <Screen>
        <AsyncState query={query}>
          {(course) => (
            <>
              <Stack gap={1}>
                <Badge tone={course.status === 'PUBLISHED' ? 'success' : 'warning'}>
                  {t(`courses.status.${course.status}`)} · v{course.version}
                </Badge>
                <Text variant="caption" tone="muted">
                  {course.group.title}
                </Text>
                {course.description && <Text tone="muted">{course.description}</Text>}
              </Stack>
              {course.modules.length === 0 && (
                <EmptyState
                  title={t('courses.modulesEmpty')}
                  description={t('courses.modulesEmptyHint')}
                />
              )}
              {course.modules.map((module) => (
                <Stack key={module.id} gap={2}>
                  <SectionTitle>{module.title}</SectionTitle>
                  {module.summary && (
                    <Text variant="caption" tone="muted">
                      {module.summary}
                    </Text>
                  )}
                  {module.blocks.length === 0 ? (
                    <Text variant="caption" tone="muted">
                      {t('courses.blocksEmpty')}
                    </Text>
                  ) : (
                    <Card padding="none">
                      {module.blocks.map((block) => (
                        <ListRow
                          key={block.id}
                          title={block.title}
                          subtitle={t(`common:blockType.${block.type}`)}
                          right={block.isRequired ? <Badge tone="info">!</Badge> : undefined}
                        />
                      ))}
                    </Card>
                  )}
                </Stack>
              ))}
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
