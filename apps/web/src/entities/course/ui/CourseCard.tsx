import { BLOCK_TYPE_META, type StudentCourseCard, type TeacherCourseCard } from '@edu/contracts';
import { Badge, Card, ProgressBar, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatPercent } from '@/shared/lib/format';

export interface CourseCardProps {
  course: StudentCourseCard;
  onClick?: () => void;
}

/** Курс ученика: название, группа, прогресс, следующий блок. */
export function CourseCard({ course, onClick }: CourseCardProps) {
  const { t } = useTranslation('student');
  return (
    <Card interactive={!!onClick} onClick={onClick}>
      <Stack gap={2}>
        <Text weight="medium">{course.title}</Text>
        <Text variant="caption" tone="muted">
          {course.group.title}
        </Text>
        <ProgressBar
          value={course.progress.percent}
          label={t('courses.blocks', {
            completed: course.progress.completedBlocks,
            total: course.progress.totalBlocks,
          })}
        />
        <Text variant="caption" tone="muted">
          {t('courses.blocks', {
            completed: course.progress.completedBlocks,
            total: course.progress.totalBlocks,
          })}
          {' · '}
          {formatPercent(course.progress.percent)}
        </Text>
        {course.nextBlock && (
          <Text variant="caption">
            {t('courses.nextBlock')}: {course.nextBlock.title} (
            {BLOCK_TYPE_META[course.nextBlock.type].label})
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export interface TeacherCourseCardProps {
  course: TeacherCourseCard;
  onClick?: () => void;
}

/** Курс преподавателя: статус, размер, средний прогресс. */
export function TeacherCourseCardView({ course, onClick }: TeacherCourseCardProps) {
  const { t } = useTranslation('teacher');
  const tone =
    course.status === 'PUBLISHED' ? 'success' : course.status === 'DRAFT' ? 'warning' : 'neutral';
  return (
    <Card interactive={!!onClick} onClick={onClick}>
      <Stack gap={2}>
        <Text weight="medium">{course.title}</Text>
        <Text variant="caption" tone="muted">
          {course.group.title} ·{' '}
          {t('courses.counts', { modules: course.modulesCount, blocks: course.blocksCount })}
        </Text>
        <Badge tone={tone}>{t(`courses.status.${course.status}`)}</Badge>
        <ProgressBar value={course.avgProgress} size="sm" label={t('courses.avgProgress')} />
      </Stack>
    </Card>
  );
}
