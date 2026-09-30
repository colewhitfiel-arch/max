import { Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useStudentBlock, useStudentCourse } from '@/entities/course';
import { ScreenHeader } from '@/shared/ui';
import { CoursePlayer } from '@/widgets/course-player';

/**
 * `/student/blocks/:blockId` — шаг курса в плеере (F3): теория, интерактив, тест с мгновенной
 * проверкой или задание со сдачей; «Назад»/«Дальше» ведут по курсу.
 */
export function BlockPage() {
  const { blockId = '' } = useParams();
  const { t } = useTranslation('student');
  const block = useStudentBlock(blockId);
  const courseId = block.data?.courseId ?? '';
  const course = useStudentCourse(courseId, { enabled: !!courseId });

  return (
    <>
      <ScreenHeader
        title={block.data?.title ?? t('courses.title')}
        subtitle={course.data?.title}
        back={courseId ? `/student/courses/${courseId}` : true}
      />
      <Screen>
        <CoursePlayer blockId={blockId} />
      </Screen>
    </>
  );
}
