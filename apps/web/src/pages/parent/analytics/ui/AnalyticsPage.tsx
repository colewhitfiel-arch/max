import { Badge, Card, ListRow, Screen, SegmentedControl, Stack } from '@edu/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LessonCard } from '@/entities/lesson';
import { useChildAnalytics } from '@/entities/student';
import { formatDate, formatDateTime, lastDaysPeriod } from '@/shared/lib/dates';
import { formatRate, formatScore } from '@/shared/lib/format';
import { useSelectedChildId } from '@/shared/store/ui-store';
import { AsyncState, DashboardSkeleton, ScreenHeader, SectionTitle } from '@/shared/ui';
import { AiTextCard } from '@/widgets/ai-text-card';
import { ClubProgressList } from '@/widgets/club-progress-list';
import { StatsTiles } from '@/widgets/stats-tiles';

const PERIODS = [7, 30, 90] as const;

/** `/parent/analytics` — `GET /parent/children/:id/analytics?from&to`. */
export function AnalyticsPage() {
  const { t, i18n } = useTranslation('parent');
  const { t: tc } = useTranslation('common');
  const studentId = useSelectedChildId();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const period = useMemo(() => lastDaysPeriod(days), [days]);
  const query = useChildAnalytics(studentId, period);

  return (
    <>
      <ScreenHeader title={t('analytics.title')} bell />
      <Screen>
        <SegmentedControl
          fullWidth
          aria-label={t('analytics.period')}
          value={String(days)}
          onChange={(value) => setDays(Number(value) as (typeof PERIODS)[number])}
          options={PERIODS.map((value) => ({
            value: String(value),
            label: t(`analytics.days${value}`),
          }))}
        />
        <AsyncState query={query} skeleton={<DashboardSkeleton />}>
          {(analytics) => (
            <>
              <StatsTiles stats={analytics.stats} />

              {analytics.clubs.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('analytics.clubs')}</SectionTitle>
                  <ClubProgressList clubs={analytics.clubs} />
                </Stack>
              )}

              {analytics.weekly.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('analytics.weekly')}</SectionTitle>
                  <Card padding="none">
                    {analytics.weekly.map((point) => (
                      <ListRow
                        key={point.weekStart}
                        title={t('analytics.week', {
                          date: formatDate(point.weekStart, i18n.language),
                        })}
                        subtitle={`${tc('stats.attendance')} ${formatRate(point.attendanceRate, i18n.language)} · ${tc('stats.completion')} ${formatRate(point.completionRate, i18n.language)}`}
                        right={<Badge>{point.activityScore}</Badge>}
                      />
                    ))}
                  </Card>
                </Stack>
              )}

              {analytics.recentResults.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('analytics.recentResults')}</SectionTitle>
                  <Card padding="none">
                    {analytics.recentResults.map((result) => (
                      <ListRow
                        key={result.assignment.id}
                        title={result.assignment.title}
                        subtitle={`${result.assignment.group.club.title} · ${formatDateTime(result.submittedAt, i18n.language)}`}
                        right={
                          <Badge tone={result.isLate ? 'warning' : 'success'}>
                            {formatScore(result.score, result.maxScore)}
                          </Badge>
                        }
                      />
                    ))}
                  </Card>
                </Stack>
              )}

              {analytics.attendanceHistory.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('analytics.attendanceHistory')}</SectionTitle>
                  <Card padding="none">
                    {analytics.attendanceHistory.map((item) => (
                      <LessonCard
                        key={item.lesson.id}
                        lesson={{ ...item.lesson, attendance: item.status }}
                      />
                    ))}
                  </Card>
                </Stack>
              )}

              <AiTextCard title={t('analytics.aiSummary')} value={analytics.aiSummary} />
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
