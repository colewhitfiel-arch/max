import type { StudentCourseDetail } from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  EmptyState,
  ListRow,
  ProgressBar,
  Screen,
  Stack,
  StarIcon,
  Text,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useStudentCourse } from '@/entities/course';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** Прогресс курса и следующий шаг: первый непройденный блок по порядку. */
function summary(course: StudentCourseDetail) {
  const blocks = course.modules.flatMap((module) => module.blocks);
  const done = blocks.filter((block) => block.progress === 'COMPLETED').length;
  const next = blocks.find((block) => block.progress !== 'COMPLETED');
  return { total: blocks.length, done, next, started: blocks.some((block) => block.progress) };
}

/** Итог и продолжение: «Начать» / «Продолжить» или «Курс пройден». */
function CourseProgressCard({ course }: { course: StudentCourseDetail }) {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const { total, done, next, started } = summary(course);
  const finished = total > 0 && done === total;
  return (
    <Card data-tour="course-progress">
      <Stack gap={3}>
        {finished ? (
          <Stack gap={1} align="center">
            <StarIcon size={32} />
            <Text variant="title" as="p" align="center">
              {t('player.finishedTitle')}
            </Text>
            <Text variant="small" tone="muted" align="center">
              {t('player.finishedText', { count: total })}
            </Text>
          </Stack>
        ) : (
          <Text weight="medium">{t('player.progress', { done, total })}</Text>
        )}
        <ProgressBar
          value={done}
          max={Math.max(total, 1)}
          tone="success"
          label={t('player.progress', { done, total })}
        />
        {next && (
          <Button
            fullWidth
            rightIcon={<ChevronRightIcon />}
            onClick={() => navigate(`/student/blocks/${next.id}`)}
          >
            {started ? t('player.continue', { title: next.title }) : t('player.start')}
          </Button>
        )}
        {finished && (
          <Button variant="secondary" fullWidth onClick={() => navigate('/student/courses')}>
            {t('player.toCourses')}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

/** `/student/courses/:courseId` — структура курса с прогрессом по блокам и кнопкой продолжения. */
export function CoursePage() {
  const { courseId = '' } = useParams();
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const query = useStudentCourse(courseId);
  return (
    <>
      <ScreenHeader title={query.data?.title ?? t('courses.title')} back="/student/courses" />
      <Screen>
        <AsyncState
          query={query}
          isEmpty={(course) => course.modules.every((module) => module.blocks.length === 0)}
          empty={
            <EmptyState title={t('courses.noBlocks')} description={t('courses.noBlocksHint')} />
          }
        >
          {(course) => (
            <>
              {course.description && <Text tone="muted">{course.description}</Text>}
              <Text variant="caption" tone="muted">
                {course.group.title}
              </Text>
              <CourseProgressCard course={course} />
              {course.modules.map((module, index) => (
                <Stack
                  key={module.id}
                  gap={2}
                  data-tour={index === 0 ? 'course-modules' : undefined}
                >
                  <SectionTitle>{module.title}</SectionTitle>
                  {module.blocks.length === 0 ? (
                    <Text variant="caption" tone="muted">
                      {t('courses.noModuleBlocks')}
                    </Text>
                  ) : (
                    <Card padding="none">
                      {module.blocks.map((block) => (
                        <ListRow
                          key={block.id}
                          title={block.title}
                          subtitle={[
                            t(`common:blockType.${block.type}`),
                            block.estimatedMinutes
                              ? t('courses.minutes', { count: block.estimatedMinutes })
                              : null,
                            block.isRequired ? t('courses.required') : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          right={
                            block.progress === 'COMPLETED' ? (
                              <Badge tone="success" role="img" aria-label={t('courses.completed')}>
                                ✓
                              </Badge>
                            ) : block.progress === 'OPENED' ? (
                              <Badge tone="info" role="img" aria-label={t('courses.blockOpened')}>
                                …
                              </Badge>
                            ) : undefined
                          }
                          onClick={() => navigate(`/student/blocks/${block.id}`)}
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
