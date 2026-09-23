import {
  Band,
  Button,
  CloseIcon,
  EmptyState,
  Screen,
  Skeleton,
  SkeletonText,
  Stack,
  Text,
} from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTeacherStudent, useTeacherStudentGroupTasks } from '@/entities/student';
import { isFromAnalytics } from '@/shared/lib/navigation';
import { teacherStudentPaths } from '@/shared/lib/teacher-paths';
import { AsyncState } from '@/shared/ui';
import { HomeworkTaskSection } from '@/widgets/homework-performance';
import { TeacherStudentHeader } from '@/widgets/teacher-student-header';
import { isStudentUnavailable, StudentUnavailable } from './StudentUnavailable';

function TasksSkeleton() {
  return (
    <Stack gap={4} aria-busy="true">
      {[0, 1].map((key) => (
        <Stack key={key} gap={3}>
          <Skeleton height={20} width="35%" />
          <SkeletonText lines={2} />
          <Skeleton height={200} />
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * `/teacher/students/:studentId/groups/:groupId/tasks?task=<assignmentId>` — задания ученика
 * в группе по макету: шапка с учеником и «Задания ✕», под ней полоса с названием курса, далее
 * полосы заданий (условие, код, ответ ученика и правильный ответ или «Предстоит выполнить»).
 * Выбранное в сетке задание прокручивается в видимую область при открытии.
 * Данные — `GET /teacher/students/:studentId/groups/:groupId/tasks` (+ карточка ученика для шапки).
 */
export function StudentTasksPage() {
  const { t } = useTranslation('teacher-performance');
  const navigate = useNavigate();
  const location = useLocation();
  const { studentId = '', groupId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('task');
  const student = useTeacherStudent(studentId);
  const query = useTeacherStudentGroupTasks(studentId, groupId);

  const sections = useRef(new Map<string, HTMLElement>());
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || !taskId || scrolledTo.current === taskId) return;
    const section = sections.current.get(taskId);
    if (!section) return;
    scrolledTo.current = taskId;
    // Первое задание и так под полосой курса — не уводим шапку за верх экрана.
    if (query.data.items[0]?.assignmentId === taskId) return;
    section.scrollIntoView?.({ block: 'start' });
  }, [query.data, taskId]);

  // Открыли из сетки — «закрыть» возвращает туда же (с раскрытым курсом); по прямой ссылке —
  // заменяем экран успеваемостью ученика с этим курсом.
  const close = () => {
    if (isFromAnalytics(location.state)) navigate(-1);
    else navigate(teacherStudentPaths.student(studentId, groupId), { replace: true });
  };

  const unavailable = isStudentUnavailable(query.error) || isStudentUnavailable(student.error);
  const course = query.data?.group.club.title;

  return (
    <>
      <TeacherStudentHeader
        screenLabel={t('tasks.title')}
        student={student.data?.student}
        fallback={student.isPending ? undefined : t('tasks.title')}
        action={
          <Button
            variant="link"
            aria-label={t('tasks.closeLabel')}
            rightIcon={<CloseIcon size={23} />}
            onClick={close}
          >
            {t('tasks.close')}
          </Button>
        }
      />
      <Screen gap={4}>
        {unavailable ? (
          <StudentUnavailable />
        ) : (
          <Stack gap={0}>
            {(course || query.isPending) && (
              <Band tone="subtle" flush>
                <Text variant="title" as="h2" weight="bold">
                  {course ?? <Skeleton height={24} width="45%" />}
                </Text>
              </Band>
            )}
            <AsyncState
              query={query}
              skeleton={<TasksSkeleton />}
              isEmpty={(data) => data.items.length === 0}
              empty={
                <EmptyState title={t('tasks.emptyTitle')} description={t('tasks.emptyText')} />
              }
            >
              {(data) => (
                <Stack gap={0} role="group" aria-label={t('tasks.listLabel')}>
                  {data.items.map((task) => (
                    <HomeworkTaskSection
                      key={task.assignmentId}
                      task={task}
                      titleAs="h3"
                      ref={(node) => {
                        if (node) sections.current.set(task.assignmentId, node);
                        else sections.current.delete(task.assignmentId);
                      }}
                    />
                  ))}
                </Stack>
              )}
            </AsyncState>
          </Stack>
        )}
      </Screen>
    </>
  );
}
