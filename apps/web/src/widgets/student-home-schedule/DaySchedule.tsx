import type { LessonDto } from '@edu/contracts';
import {
  BellIcon,
  CalendarClockIcon,
  Card,
  CardColumns,
  ChevronLeftIcon,
  ChevronRightIcon,
  EmptyState,
  IconButton,
  Inline,
  Stack,
  Text,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  formatDate,
  formatTimeRange,
  formatWeekday,
  isSameDay,
  startOfDay,
} from '@/shared/lib/dates';

export interface DayScheduleProps {
  /** Занятия сегодня и ближайшие (из `StudentHomeDto`). */
  today: LessonDto[];
  upcoming: LessonDto[];
  /** Непрочитанные уведомления — число в колокольчике. */
  unreadCount?: number;
  onOpenNotifications?: () => void;
}

/** Глубина навигации по дням: `upcoming` покрывает ближайшие 7 дней (сегодня + 6). */
const MAX_OFFSET = 6;

function dayLabel(offset: number, date: Date, locale: string, t: (key: string) => string) {
  if (offset === 0) return t('home.today');
  if (offset === 1) return t('home.tomorrow');
  const weekday = formatWeekday(date, locale);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDate(date, locale)}`;
}

/**
 * Расписание по дням: «‹ Сегодня ›» + три карточки-колонки (название кружка, группа, время).
 * Текущее/ближайшее занятие сегодняшнего дня выделено цветом.
 */
export function DaySchedule({
  today,
  upcoming,
  unreadCount,
  onOpenNotifications,
}: DayScheduleProps) {
  const { t, i18n } = useTranslation('student');
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const date = addDays(startOfDay(now), offset);

  const lessons = [...today, ...upcoming]
    .filter((lesson) => isSameDay(lesson.startsAt, date))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const highlightedId =
    offset === 0
      ? (lessons.find((lesson) => new Date(lesson.endsAt).getTime() > now.getTime())?.id ?? null)
      : null;

  return (
    <Stack gap={4}>
      <Inline justify="between" align="center" wrap={false}>
        <IconButton
          aria-label={t('home.calendar')}
          onClick={() => setOffset(0)}
          disabled={offset === 0}
        >
          <Text as="span" tone="muted">
            <CalendarClockIcon size={30} />
          </Text>
        </IconButton>

        <Inline gap={6} align="center" wrap={false}>
          <IconButton
            aria-label={t('home.prevDay')}
            onClick={() => setOffset((value) => Math.max(0, value - 1))}
            disabled={offset === 0}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Text as="span" variant="title" aria-live="polite">
            {dayLabel(offset, date, i18n.language, t)}
          </Text>
          <IconButton
            aria-label={t('home.nextDay')}
            onClick={() => setOffset((value) => Math.min(MAX_OFFSET, value + 1))}
            disabled={offset === MAX_OFFSET}
          >
            <ChevronRightIcon />
          </IconButton>
        </Inline>

        <IconButton
          aria-label={
            unreadCount
              ? t('home.notificationsUnread', { count: unreadCount })
              : t('home.notifications')
          }
          onClick={onOpenNotifications}
        >
          <Text as="span" tone="muted">
            <BellIcon size={30} count={unreadCount} />
          </Text>
        </IconButton>
      </Inline>

      {lessons.length === 0 ? (
        <Card>
          <EmptyState title={offset === 0 ? t('home.noLessonsToday') : t('home.noLessonsOnDay')} />
        </Card>
      ) : (
        <CardColumns
          aria-label={dayLabel(offset, date, i18n.language, t)}
          columns={[
            { key: 'name', header: t('home.columns.name'), fit: true },
            { key: 'group', header: t('home.columns.group'), align: 'center' },
            { key: 'time', header: t('home.columns.time'), align: 'center', nowrap: true },
          ]}
          rows={lessons.map((lesson) => ({
            key: lesson.id,
            cells: {
              name: lesson.group.club.title,
              group: lesson.group.title,
              time: (
                <Text
                  as="span"
                  variant="small"
                  tone={lesson.id === highlightedId ? 'primary' : 'default'}
                >
                  {formatTimeRange(lesson.startsAt, lesson.endsAt, i18n.language)}
                </Text>
              ),
            },
          }))}
        />
      )}
    </Stack>
  );
}
