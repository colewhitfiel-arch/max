import type { ClubProgress } from '@edu/contracts';
import { Card, ListRow, ProgressBar, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatPercent, formatRate } from '@/shared/lib/format';

/** Кружки с прогрессом (ClubProgress[]) — ученик, родитель, преподаватель. */
export function ClubProgressList({ clubs }: { clubs: ClubProgress[] }) {
  const { t, i18n } = useTranslation('common');
  return (
    <Card padding="none">
      {clubs.map((item) => (
        <ListRow
          key={item.group.id}
          title={item.club.title}
          subtitle={
            <Stack gap={1}>
              <span>
                {item.group.title} · {t('stats.attendance').toLowerCase()}{' '}
                {formatRate(item.attendanceRate, i18n.language)}
              </span>
              <ProgressBar value={item.percent} size="sm" label={t('stats.progress')} />
            </Stack>
          }
          right={formatPercent(item.percent)}
        />
      ))}
    </Card>
  );
}
