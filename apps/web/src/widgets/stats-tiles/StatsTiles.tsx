import type { StatsBrief } from '@edu/contracts';
import { Grid, StatTile } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatRate } from '@/shared/lib/format';

/** Плитки StatsBrief 2×2: посещаемость, выполнение, активность, пропуски. */
export function StatsTiles({ stats }: { stats: StatsBrief }) {
  const { t, i18n } = useTranslation('common');
  const hint = t('stats.period30');
  const tone = (rate: number | null) =>
    rate == null ? 'neutral' : rate >= 0.8 ? 'success' : rate >= 0.5 ? 'warning' : 'danger';
  return (
    <Grid columns={2} gap={2}>
      <StatTile
        label={t('stats.attendance')}
        value={formatRate(stats.attendanceRate, i18n.language)}
        hint={hint}
        tone={tone(stats.attendanceRate)}
      />
      <StatTile
        label={t('stats.completion')}
        value={formatRate(stats.completionRate, i18n.language)}
        hint={hint}
        tone={tone(stats.completionRate)}
      />
      <StatTile label={t('stats.activity')} value={String(stats.activityScore)} hint={hint} />
      <StatTile
        label={t('stats.absences')}
        value={String(stats.absences)}
        hint={hint}
        tone={stats.absences > 0 ? 'warning' : 'neutral'}
      />
    </Grid>
  );
}
