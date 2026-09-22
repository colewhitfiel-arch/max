import type { LessonDto } from '@edu/contracts';
import { DockSheet, MonthCalendar, Spinner, Stack, Text } from '@edu/ui';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { lessonsOfDay } from '@/entities/lesson';
import { formatTimeRange, isSameDay } from '@/shared/lib/dates';

export interface StudentCalendarSheetProps {
  open: boolean;
  onClose: () => void;
  /** Строка «календарь · день · колокольчик» главной — к ней пристыковывается вкладка. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Выбранный день (общий с расписанием главной). */
  date: Date;
  onDateChange: (date: Date) => void;
  /** Показываемый месяц. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Занятия показываемого месяца; `undefined` — ещё грузятся. */
  lessons: LessonDto[] | undefined;
  /** Не удалось загрузить месяц. */
  error?: boolean;
}

/**
 * Шторка-календарь главной ученика (макет «календарь»): во вкладке — выбранная дата,
 * слева — месяц с точками на днях с занятиями, справа — занятия выбранного дня.
 * Выбор дня переключает и расписание главной под шторкой.
 */
export function StudentCalendarSheet({
  open,
  onClose,
  anchorRef,
  date,
  onDateChange,
  month,
  onMonthChange,
  lessons,
  error = false,
}: StudentCalendarSheetProps) {
  const { t, i18n } = useTranslation('student');
  const locale = i18n.language;
  const tabDate = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const hasLessons = (day: Date) => !!lessons?.some((lesson) => isSameDay(lesson.startsAt, day));
  const dayLessons = lessons ? lessonsOfDay(lessons, date) : [];

  let aside;
  if (error) {
    aside = (
      <Text variant="caption" tone="muted" align="center" as="p">
        {t('home.calendarError')}
      </Text>
    );
  } else if (!lessons) {
    aside = (
      <Stack align="center" justify="center" grow>
        <Spinner size="sm" aria-label={t('home.calendarLoading')} />
      </Stack>
    );
  } else if (dayLessons.length === 0) {
    aside = (
      <Text variant="caption" tone="muted" align="center" as="p">
        {t('home.noLessonsOnDay')}
      </Text>
    );
  } else {
    aside = (
      <Stack as="ul" gap={4} aria-label={t('home.calendarLessons', { date: tabDate })}>
        {dayLessons.map((lesson) => (
          <Stack as="li" key={lesson.id} gap={1}>
            <Text variant="caption" tone="primary" weight="medium">
              {formatTimeRange(lesson.startsAt, lesson.endsAt, locale)}
            </Text>
            <Text variant="caption">{lesson.group.club.title}</Text>
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <DockSheet
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      tab={tabDate}
      aside={aside}
      aria-label={t('home.calendarTitle')}
    >
      <MonthCalendar
        month={month}
        onMonthChange={onMonthChange}
        selected={date}
        onSelect={onDateChange}
        isMarked={hasLessons}
        describeDay={(day) => (hasLessons(day) ? t('home.hasLessons') : undefined)}
        locale={locale}
        prevLabel={t('home.prevMonth')}
        nextLabel={t('home.nextMonth')}
      />
    </DockSheet>
  );
}
