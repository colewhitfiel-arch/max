import type { WeekDay, WeekDayStatus } from '@edu/contracts';
import { Card, Stack, Text, WeekArc, type WeekArcTone } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatWeekday, parseDateOnly } from '@/shared/lib/dates';

export interface AttendanceWeekCardProps {
  week: WeekDay[];
}

const TONE_BY_STATUS: Record<WeekDayStatus, WeekArcTone> = {
  ATTENDED: 'success',
  MISSED: 'danger',
  TODAY: 'info',
  UPCOMING: 'muted',
  NO_LESSONS: 'neutral',
};

/** Легенда — только статусы из макета; UPCOMING читается по приглушённой плашке. */
const LEGEND: WeekDayStatus[] = ['ATTENDED', 'MISSED', 'TODAY', 'NO_LESSONS'];

/** Карточка «Посещения»: дуга дней текущей недели с цветом по статусу. */
export function AttendanceWeekCard({ week }: AttendanceWeekCardProps) {
  const { t, i18n } = useTranslation('student');
  const fullWeekday = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(parseDateOnly(date));
  return (
    <Card>
      <Stack gap={3}>
        <Text as="h2" variant="body" weight="bold" align="center">
          {t('home.attendance')}
        </Text>
        <WeekArc
          aria-label={t('home.attendanceWeek')}
          items={week.map((day) => ({
            key: day.date,
            label: formatWeekday(parseDateOnly(day.date), i18n.language),
            tone: TONE_BY_STATUS[day.status],
            title: `${fullWeekday(day.date)} — ${t(`home.dayStatus.${day.status}`)}`,
          }))}
          legend={LEGEND.map((status) => ({
            tone: TONE_BY_STATUS[status],
            label: t(`home.dayStatus.${status}`),
          }))}
        />
      </Stack>
    </Card>
  );
}
