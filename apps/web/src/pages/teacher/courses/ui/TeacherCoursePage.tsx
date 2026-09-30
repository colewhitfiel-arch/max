import type { CourseBlock, TeacherCourseDetail } from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  ChevronDownIcon,
  ChevronUpIcon,
  EmptyState,
  Inline,
  ListRow,
  ProgressBar,
  Screen,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  BlockPreview,
  useArchiveCourse,
  useCourseProgress,
  usePublishCourse,
  useTeacherCourse,
} from '@/entities/course';
import { describeApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { teacherGroupPaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** Блок курса: строка с типом; нажатие раскрывает содержимое целиком (с ответами). */
function CourseBlockRow({ block }: { block: CourseBlock }) {
  const { t } = useTranslation('teacher');
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={block.title}
        subtitle={t(`common:blockType.${block.type}`)}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        right={
          <Inline gap={1} align="center" wrap={false}>
            {block.isRequired && <Badge tone="info">!</Badge>}
            {open ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </Inline>
        }
      />
      {open && (
        <Card padding="md">
          <BlockPreview block={block} />
        </Card>
      )}
    </>
  );
}

/** Публикация и архив: черновик публикуется для группы, опубликованный — убирается в архив. */
function CourseActions({ course }: { course: TeacherCourseDetail }) {
  const { t } = useTranslation('teacher');
  const toast = useToast();
  const publish = usePublishCourse(course.id);
  const archive = useArchiveCourse(course.id);
  const onError = (error: unknown) =>
    toast.show({ tone: 'danger', title: describeApiError(error) });
  const blocks = course.modules.reduce((sum, module) => sum + module.blocks.length, 0);

  if (course.status === 'DRAFT')
    return (
      <Card data-tour="course-status">
        <Stack gap={2}>
          <Text variant="small">{t('courses.publishHint')}</Text>
          <Button
            fullWidth
            loading={publish.isPending}
            disabled={blocks === 0}
            onClick={() =>
              publish.mutate(
                { assignments: [] },
                {
                  onSuccess: () => toast.show({ tone: 'success', title: t('courses.published') }),
                  onError,
                },
              )
            }
          >
            {t('courses.publish')}
          </Button>
        </Stack>
      </Card>
    );
  if (course.status === 'PUBLISHED')
    return (
      <Stack gap={2} data-tour="course-status">
        <Text variant="small" tone="muted">
          {t('courses.publishedHint')}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          loading={archive.isPending}
          onClick={() =>
            archive.mutate(undefined, {
              onSuccess: () => toast.show({ tone: 'success', title: t('courses.archived') }),
              onError,
            })
          }
        >
          {t('courses.archive')}
        </Button>
      </Stack>
    );
  return null;
}

/** Прогресс учеников группы по опубликованному курсу. */
function CourseProgressSection({ course }: { course: TeacherCourseDetail }) {
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const query = useCourseProgress(course.id);
  return (
    <Stack gap={2} data-tour="course-progress">
      <SectionTitle>{t('courses.progressTitle')}</SectionTitle>
      <AsyncState
        query={query}
        isEmpty={(report) => report.students.length === 0}
        empty={
          <EmptyState
            title={t('courses.progressEmpty')}
            description={t('courses.progressEmptyHint')}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(teacherGroupPaths.group(course.group.id))}
              >
                {t('courses.openGroup')}
              </Button>
            }
          />
        }
      >
        {(report) => (
          <Card padding="none">
            {report.students.map((row) => (
              <ListRow
                key={row.student.id}
                title={fullName(row.student.user)}
                subtitle={
                  <Stack gap={1}>
                    <ProgressBar
                      value={row.percent}
                      tone="success"
                      size="sm"
                      label={t('courses.studentProgress', { percent: row.percent })}
                    />
                    <Text variant="caption" tone="muted">
                      {row.lastActivityAt
                        ? t('courses.lastActivity', {
                            date: formatDateTime(row.lastActivityAt, i18n.language),
                          })
                        : t('courses.notStarted')}
                    </Text>
                  </Stack>
                }
                right={
                  <Badge tone={row.percent === 100 ? 'success' : 'neutral'}>{row.percent}%</Badge>
                }
              />
            ))}
          </Card>
        )}
      </AsyncState>
    </Stack>
  );
}

/**
 * `/teacher/courses/:courseId` — курс преподавателя: статус, публикация для группы, модули с
 * раскрывающимися блоками (как их увидит ученик, но с ответами) и прогресс учеников.
 */
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
                <Inline gap={2} align="center">
                  <Badge
                    tone={
                      course.status === 'PUBLISHED'
                        ? 'success'
                        : course.status === 'ARCHIVED'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {t(`courses.status.${course.status}`)} · v{course.version}
                  </Badge>
                  <Text variant="caption" tone="muted">
                    {course.group.title}
                  </Text>
                </Inline>
                {course.description && <Text tone="muted">{course.description}</Text>}
              </Stack>
              <CourseActions course={course} />
              {course.status === 'PUBLISHED' && <CourseProgressSection course={course} />}
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
                        <CourseBlockRow key={block.id} block={block} />
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
