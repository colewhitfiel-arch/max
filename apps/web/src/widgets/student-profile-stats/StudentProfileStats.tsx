import type { StatsBrief } from '@edu/contracts';
import { Card, Grid, ProgressRing, Stack, StatTile, Text, type Tone } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatRate } from '@/shared/lib/format';

export interface StudentProfileStatsProps {
  stats: StatsBrief;
}

const toneOf = (rate: number | null): Tone =>
  rate == null ? 'neutral' : rate >= 0.8 ? 'success' : rate >= 0.5 ? 'warning' : 'danger';

/** Кольцо с процентом и подписью — в карточке стиля главной. */
function RingStat({ label, rate }: { label: string; rate: number | null }) {
  const { i18n } = useTranslation();
  const value = formatRate(rate, i18n.language);
  return (
    <Card>
      <Stack gap={2} align="center">
        <ProgressRing
          value={(rate ?? 0) * 100}
          size={72}
          thickness={7}
          tone={toneOf(rate)}
          label={label}
        >
          <Text as="span" variant="small" weight="bold">
            {value}
          </Text>
        </ProgressRing>
        <Text variant="small" tone="muted" align="center">
          {label}
        </Text>
      </Stack>
    </Card>
  );
}

/** Статистика за 30 дней: кольца посещаемости и выполнения + плитки активности и пропусков. */
export function StudentProfileStats({ stats }: StudentProfileStatsProps) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('student');
  return (
    <Stack gap={2}>
      <Text as="h2" variant="body" weight="bold">
        {ts('profile.stats')}{' '}
        <Text as="span" variant="small" tone="muted" weight="regular">
          · {ts('profile.period')}
        </Text>
      </Text>
      <Grid columns={2} gap={3}>
        <RingStat label={t('stats.attendance')} rate={stats.attendanceRate} />
        <RingStat label={t('stats.completion')} rate={stats.completionRate} />
        <StatTile label={t('stats.activity')} value={String(stats.activityScore)} tone="info" />
        <StatTile
          label={t('stats.absences')}
          value={String(stats.absences)}
          tone={stats.absences > 0 ? 'warning' : 'neutral'}
        />
      </Grid>
    </Stack>
  );
}
