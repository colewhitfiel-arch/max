import {
  TEACHER_PERFORMANCE_DEFAULT_PERIOD,
  TEACHER_PERFORMANCE_PERIODS,
  type TeacherPerformanceDto,
  type TeacherPerformancePeriod,
} from '@edu/contracts';
import {
  DataTable,
  EmptyState,
  Inline,
  Screen,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { groupLabel, useTeacherPerformance } from '@/entities/group';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { teacherPerformancePaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { TeacherPerformanceAttendance } from '@/widgets/teacher-performance-attendance';
import { PERIOD_PARAM } from '../paths';

const isPeriod = (value: string | null): value is TeacherPerformancePeriod =>
  value !== null && (TEACHER_PERFORMANCE_PERIODS as readonly string[]).includes(value);

function PerformanceSkeleton() {
  return (
    <Stack gap={6} aria-busy="true">
      <Skeleton height={159} />
      <Stack gap={2}>
        <Skeleton height={14} width="70%" />
        <Skeleton height={132} />
      </Stack>
    </Stack>
  );
}

interface PerformanceContentProps {
  data: TeacherPerformanceDto;
  /** Показаны данные прежнего периода, новый ещё грузится. */
  stale: boolean;
  onOpenGroup: (groupId: string) => void;
}

function PerformanceContent({ data, stale, onOpenGroup }: PerformanceContentProps) {
  const { t } = useTranslation('teacher-performance');
  return (
    <Stack gap={6} aria-busy={stale || undefined}>
      <TeacherPerformanceAttendance groups={data.groups} />
      <DataTable
        caption={t('table.caption')}
        columns={[
          // Доли под заголовки макета: при ширине телефона каждый — в одну строку.
          { key: 'group', header: t('table.group'), weight: 1.1 },
          {
            key: 'correct',
            header: t('table.correct'),
            align: 'center',
            weight: 3,
            tone: 'success',
          },
          { key: 'done', header: t('table.done'), align: 'center', weight: 2.1, tone: 'primary' },
        ]}
        rows={data.groups.map((row) => {
          const label = groupLabel(row.group);
          return {
            key: row.group.id,
            cells: { group: label, correct: row.homeworkCorrect, done: row.homeworkDone },
            onClick: () => onOpenGroup(row.group.id),
            'aria-label': t('table.rowLabel', { group: label }),
          };
        })}
      />
    </Stack>
  );
}

/**
 * `/teacher/performance` — «Общая успеваемость» по макету: переключатель периода (1 день /
 * 7 дней / 30 дней / курс, запоминается в `?period=`), карточка «Посещения» со столбцами по
 * группам и таблица домашних заданий; строка таблицы → ученики группы.
 * Данные — `GET /teacher/performance?period=`.
 */
export function PerformancePage() {
  const { t } = useTranslation('teacher-performance');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(PERIOD_PARAM);
  const period = isPeriod(requested) ? requested : TEACHER_PERFORMANCE_DEFAULT_PERIOD;
  const query = useTeacherPerformance(period);

  const changePeriod = (value: string) => {
    if (!isPeriod(value)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === TEACHER_PERFORMANCE_DEFAULT_PERIOD) next.delete(PERIOD_PARAM);
        else next.set(PERIOD_PARAM, value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      {/* В макете (65:483) заголовок обычного начертания, а не полужирный, как у PageHeader. */}
      <ScreenHeader
        title={
          <Text as="span" variant="title" weight="regular">
            {t('title')}
          </Text>
        }
      />
      <Screen gap={4}>
        <Inline justify="center">
          <SegmentedControl
            aria-label={t('period.label')}
            variant="accent"
            options={TEACHER_PERFORMANCE_PERIODS.map((value) => ({
              value,
              label: t(`period.${value}`),
            }))}
            value={period}
            onChange={changePeriod}
          />
        </Inline>
        <AsyncState
          query={query}
          skeleton={<PerformanceSkeleton />}
          isEmpty={(data) => data.groups.length === 0}
          empty={<EmptyState title={t('empty.title')} description={t('empty.text')} />}
        >
          {(data) => (
            <PerformanceContent
              data={data}
              stale={query.isPlaceholderData}
              onOpenGroup={(groupId) =>
                navigate(teacherPerformancePaths.group(groupId), { state: FROM_APP_STATE })
              }
            />
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
