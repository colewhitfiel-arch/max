import type { ClubProgress } from '@edu/contracts';
import { BookIcon, Card, IconTile, ListRow, ProgressRing, Text, type Tone } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatPercent, formatRate } from '@/shared/lib/format';

const toneOf = (percent: number): Tone =>
  percent >= 80 ? 'success' : percent >= 40 ? 'info' : 'warning';

/** Кружки с прогрессом (ClubProgress[]) — ученик, родитель, преподаватель. */
export function ClubProgressList({ clubs }: { clubs: ClubProgress[] }) {
  const { t, i18n } = useTranslation('common');
  return (
    <Card padding="none">
      {clubs.map((item) => (
        <ListRow
          key={item.group.id}
          left={
            <IconTile tone="info">
              <BookIcon />
            </IconTile>
          }
          title={item.club.title}
          subtitle={`${item.group.title} · ${t('stats.attendance').toLowerCase()} ${formatRate(
            item.attendanceRate,
            i18n.language,
          )}`}
          right={
            <ProgressRing
              value={item.percent}
              size={44}
              thickness={4}
              tone={toneOf(item.percent)}
              label={`${t('stats.progress')}: ${formatPercent(item.percent)}`}
            >
              <Text as="span" variant="caption" weight="medium">
                {formatPercent(item.percent)}
              </Text>
            </ProgressRing>
          }
        />
      ))}
    </Card>
  );
}
