import { Button, Card, EmptyState, Screen, Skeleton, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useTeacherGroup } from '@/entities/group';
import { StudentRow } from '@/entities/student';
import { isApiClientError } from '@/shared/api/errors';
import { formatPercent } from '@/shared/lib/format';
import { FROM_APP_STATE, isFromApp } from '@/shared/lib/navigation';
import { teacherPerformancePaths, teacherStudentPaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ListSkeleton, ScreenHeader, SectionTitle } from '@/shared/ui';

/**
 * `/teacher/performance/groups/:groupId` — ученики группы (выбор ученика, по образцу выбора
 * ребёнка у родителя): номер группы и курс в шапке, строки учеников с посещаемостью и
 * прогрессом → подробная успеваемость ученика. Данные — `GET /teacher/groups/:groupId`.
 */
export function GroupStudentsPage() {
  const { t } = useTranslation('teacher-performance');
  const navigate = useNavigate();
  const location = useLocation();
  const { groupId = '' } = useParams();
  const query = useTeacherGroup(groupId);
  const group = query.data;

  // Чужая (или несуществующая — сервер отдаёт её так же, docs/05) группа — 403. NOT_FOUND —
  // «раздел в разработке» (нет ручки на сервере), его показывает AsyncState (AGENT_GUIDE §3).
  const notFound = isApiClientError(query.error) && query.error.code === 'FORBIDDEN';

  const title = group ? (
    group.code ? (
      t('group.title', { code: group.code })
    ) : (
      group.title
    )
  ) : query.isPending ? (
    <Skeleton height={24} width="45%" />
  ) : (
    t('group.fallbackTitle')
  );

  return (
    <>
      <ScreenHeader
        title={title}
        subtitle={group?.club.title}
        // Из «Общей успеваемости» — назад по истории (сохраняется выбранный период).
        back={isFromApp(location.state) ? true : teacherPerformancePaths.overview}
      />
      <Screen gap={4}>
        {notFound ? (
          <EmptyState
            title={t('group.notFoundTitle')}
            description={t('group.notFoundText')}
            action={
              <Button onClick={() => navigate(teacherPerformancePaths.overview, { replace: true })}>
                {t('toPerformance')}
              </Button>
            }
          />
        ) : (
          <AsyncState
            query={query}
            skeleton={<ListSkeleton rows={3} />}
            isEmpty={(data) => data.students.length === 0}
            empty={<EmptyState title={t('group.emptyTitle')} description={t('group.emptyText')} />}
          >
            {(data) => (
              <Stack gap={2}>
                <SectionTitle>{t('group.students')}</SectionTitle>
                <Card padding="none">
                  {data.students.map((row) => (
                    <StudentRow
                      key={row.student.id}
                      student={row.student}
                      subtitle={t('group.studentStats', {
                        // Оба процента одним форматом («92%», как в макетах), доля → проценты.
                        attendance: formatPercent(
                          row.attendanceRate == null ? null : row.attendanceRate * 100,
                        ),
                        progress: formatPercent(row.progress),
                      })}
                      onClick={() =>
                        navigate(teacherStudentPaths.student(row.student.id), {
                          state: FROM_APP_STATE,
                        })
                      }
                    />
                  ))}
                </Card>
              </Stack>
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}
