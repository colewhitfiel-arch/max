import { Button, CloseIcon, EmptyState, Screen, Skeleton, SkeletonText, Stack } from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useChildGroupTasks } from '@/entities/student';
import { isApiClientError } from '@/shared/api/errors';
import { isFromAnalytics } from '@/shared/lib/navigation';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { HomeworkTaskSection } from '@/widgets/homework-performance';
import { analyticsPaths } from '../paths';

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
 * `/parent/analytics/:studentId/groups/:groupId/tasks?task=<assignmentId>` — подробная
 * аналитика заданий группы по макету: слева название кружка, справа «Задания ×» (назад к
 * успеваемости); полосы заданий с условием, кодом и результатом. Выбранное в сетке задание
 * прокручивается в видимую область при открытии.
 */
export function TaskDetailsPage() {
  const { t } = useTranslation('parent-analytics');
  const navigate = useNavigate();
  const location = useLocation();
  const { studentId = '', groupId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('task');
  const query = useChildGroupTasks(studentId, groupId);

  const sections = useRef(new Map<string, HTMLElement>());
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || !taskId || scrolledTo.current === taskId) return;
    const section = sections.current.get(taskId);
    if (!section) return;
    scrolledTo.current = taskId;
    // Первое задание и так под шапкой — не уводим «Задания ×» за верх экрана.
    if (query.data.items[0]?.assignmentId === taskId) return;
    section.scrollIntoView?.({ block: 'start' });
  }, [query.data, taskId]);

  // Открыли из сетки — «закрыть» возвращает туда же (с раскрытым кружком); по прямой ссылке —
  // заменяем экран аналитикой ребёнка с этим кружком.
  const close = () => {
    if (isFromAnalytics(location.state)) navigate(-1);
    else navigate(analyticsPaths.child(studentId, groupId), { replace: true });
  };

  const title = query.data?.group.club.title;
  // Чужая группа или ребёнок — это не «раздел в разработке» (как NOT_FOUND в AsyncState).
  const notFound =
    isApiClientError(query.error) &&
    (query.error.code === 'NOT_FOUND' || query.error.code === 'FORBIDDEN');

  return (
    <>
      {/* Липкая шапка, как в макете: «Задания ×» остаётся под рукой при прокрутке к заданию N. */}
      <ScreenHeader
        variant="solid"
        sticky
        title={title ?? (query.isPending ? <Skeleton height={24} width="45%" /> : t('title'))}
        actions={
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
        {notFound ? (
          <EmptyState
            title={t('tasks.notFoundTitle')}
            description={t('tasks.notFoundText')}
            action={
              <Button onClick={() => navigate(analyticsPaths.child(studentId), { replace: true })}>
                {t('tasks.back')}
              </Button>
            }
          />
        ) : (
          <AsyncState
            query={query}
            skeleton={<TasksSkeleton />}
            isEmpty={(data) => data.items.length === 0}
            empty={<EmptyState title={t('tasks.emptyTitle')} description={t('tasks.emptyText')} />}
          >
            {(data) => (
              <Stack gap={0} role="group" aria-label={t('tasks.listLabel')}>
                {data.items.map((task) => (
                  <HomeworkTaskSection
                    key={task.assignmentId}
                    task={task}
                    ref={(node) => {
                      if (node) sections.current.set(task.assignmentId, node);
                      else sections.current.delete(task.assignmentId);
                    }}
                  />
                ))}
              </Stack>
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}
