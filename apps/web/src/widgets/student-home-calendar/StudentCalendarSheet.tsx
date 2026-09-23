import type { LessonDto } from '@edu/contracts';
import { Badge, Button, DockSheet, MonthCalendar, Spinner, Stack, Text } from '@edu/ui';
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
  /** Занятия показываемого месяца (точки на днях); `undefined` — ещё грузятся. */
  lessons: LessonDto[] | undefined;
  /**
   * Где искать занятия выбранного дня для правой колонки. По умолчанию — `lessons`; главная
   * ученика передаёт ещё неделю главной и месяц выбранного дня, чтобы при листании месяцев
   * колонка не пустела.
   */
  selectedDayLessons?: LessonDto[];
  /** Не удалось загрузить месяц. */
  error?: boolean;
  /** Повторить загрузку месяца (кнопка под ошибкой). */
  onRetry?: () => void;
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
  selectedDayLessons,
  error = false,
  onRetry,
}: StudentCalendarSheetProps) {
  const { t, i18n } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const locale = i18n.language;
  const tabDate = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const hasLessons = (day: Date) => !!lessons?.some((lesson) => isSameDay(lesson.startsAt, day));
  const dayPool = selectedDayLessons ?? lessons;
  const dayLessons = dayPool ? lessonsOfDay(dayPool, date) : [];

  let aside;
  if (error) {
    aside = (
      <Stack gap={2} align="center" role="alert">
        <Text variant="caption" tone="danger" align="center" as="p">
          {t('home.calendarError')}
        </Text>
        {onRetry && (
          <Button variant="link" size="sm" onClick={onRetry}>
            {tc('actions.retry')}
          </Button>
        )}
      </Stack>
    );
  } else if (!dayPool || (!lessons && dayLessons.length === 0)) {
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
        {dayLessons.map((lesson) => {
          const cancelled = lesson.status === 'CANCELLED';
          return (
            <Stack as="li" key={lesson.id} gap={1} align="start">
              <Text variant="caption" tone={cancelled ? 'muted' : 'primary'} weight="medium">
                {formatTimeRange(lesson.startsAt, lesson.endsAt, locale)}
              </Text>
              <Text variant="caption" tone={cancelled ? 'muted' : 'default'}>
                {lesson.group.club.title}
              </Text>
              {cancelled && <Badge tone="danger">{tc('lesson.cancelled')}</Badge>}
            </Stack>
          );
        })}
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
