import type { ChildAnalyticsDto, HomeworkCounts } from '@edu/contracts';
import { Button, EmptyState, Screen, Skeleton, Stack } from '@edu/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useChildPerformance, useChildren } from '@/entities/student';
import { fullName } from '@/shared/lib/format';
import { FROM_ANALYTICS_STATE } from '@/shared/lib/navigation';
import { useUiStore } from '@/shared/store/ui-store';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { ClubHomeworkBand, HomeworkPieCard } from '@/widgets/homework-performance';
import { AttendanceWeekCard } from '@/widgets/student-home-attendance';
import { analyticsPaths } from '../paths';

/** Параметр URL с раскрытым кружком: при возврате с подробностей сетка остаётся открытой. */
const EXPANDED_PARAM = 'club';

const NO_HOMEWORK: HomeworkCounts = { correct: 0, wrong: 0, upcoming: 0 };

function ChildAnalyticsSkeleton() {
  return (
    <Stack gap={6} aria-busy="true">
      <Skeleton height={159} />
      <Stack gap={2}>
        <Skeleton height={18} width="40%" />
        <Skeleton height={150} />
      </Stack>
      <Skeleton height={102} />
      <Skeleton height={102} />
    </Stack>
  );
}

interface ChildAnalyticsContentProps {
  analytics: ChildAnalyticsDto;
  expandedGroupId: string | null;
  onToggle: (groupId: string) => void;
  onSelectTask: (groupId: string, assignmentId: string) => void;
}

function ChildAnalyticsContent({
  analytics,
  expandedGroupId,
  onToggle,
  onSelectTask,
}: ChildAnalyticsContentProps) {
  const { t } = useTranslation('parent-analytics');
  const clubs = analytics.clubHomework ?? [];
  return (
    <>
      {analytics.week && analytics.week.length > 0 && <AttendanceWeekCard week={analytics.week} />}
      <HomeworkPieCard counts={analytics.homework ?? NO_HOMEWORK} />
      {clubs.length === 0 ? (
        <EmptyState title={t('child.clubsEmptyTitle')} description={t('child.clubsEmptyText')} />
      ) : (
        <Stack gap={4} role="group" aria-label={t('child.clubsLabel')}>
          {clubs.map((item) => (
            <ClubHomeworkBand
              key={item.group.id}
              item={item}
              expanded={expandedGroupId === item.group.id}
              onToggle={() => onToggle(item.group.id)}
              onSelectTask={(assignmentId) => onSelectTask(item.group.id, assignmentId)}
            />
          ))}
        </Stack>
      )}
    </>
  );
}

/**
 * `/parent/analytics/:studentId` — успеваемость ребёнка по макету: дуга посещений недели,
 * круговая диаграмма домашних задач и полосы кружков с раскрываемой сеткой заданий (одна
 * раскрыта за раз, запоминается в `?club=`). Клетка задания → подробности заданий группы.
 * Данные — `GET /parent/children/:id/analytics` (`week`, `homework`, `clubHomework`).
 */
export function ChildAnalyticsPage() {
  const { t } = useTranslation('parent-analytics');
  const navigate = useNavigate();
  const { studentId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const expandedGroupId = searchParams.get(EXPANDED_PARAM);

  const children = useChildren();
  const child = children.data?.items.find((item) => item.student.id === studentId);
  const notLinked = children.isSuccess && !child;
  const query = useChildPerformance(notLinked ? null : studentId);

  // Открыли по ссылке — делаем ребёнка выбранным, чтобы главная и тьютор были про него же.
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  useEffect(() => {
    if (child && child.student.id !== selectedChildId) setSelectedChildId(child.student.id);
  }, [child, selectedChildId, setSelectedChildId]);

  const toggle = (groupId: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get(EXPANDED_PARAM) === groupId) next.delete(EXPANDED_PARAM);
        else next.set(EXPANDED_PARAM, groupId);
        return next;
      },
      { replace: true },
    );

  const openTask = (groupId: string, assignmentId: string) =>
    navigate(analyticsPaths.tasks(studentId, groupId, assignmentId), {
      state: FROM_ANALYTICS_STATE,
    });

  return (
    <>
      <ScreenHeader
        title={t('title')}
        subtitle={child ? fullName(child.student.user) : undefined}
        back={analyticsPaths.picker}
      />
      <Screen gap={6}>
        {notLinked ? (
          <EmptyState
            title={t('child.notFoundTitle')}
            description={t('child.notFoundText')}
            action={
              <Button onClick={() => navigate(analyticsPaths.picker, { replace: true })}>
                {t('child.toPicker')}
              </Button>
            }
          />
        ) : (
          <AsyncState query={query} skeleton={<ChildAnalyticsSkeleton />}>
            {(analytics) => (
              <ChildAnalyticsContent
                analytics={analytics}
                expandedGroupId={expandedGroupId}
                onToggle={toggle}
                onSelectTask={openTask}
              />
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}
