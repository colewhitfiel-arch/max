import type { LessonDto } from '@edu/contracts';
import {
  BellIcon,
  Button,
  CalendarClockIcon,
  Card,
  type CardColumnAction,
  CardColumns,
  ChevronLeftIcon,
  ChevronRightIcon,
  EmptyState,
  IconButton,
  Inline,
  PlusIcon,
  Skeleton,
  Stack,
  Text,
} from '@edu/ui';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { lessonsOfDay } from '@/entities/lesson';
import {
  addDays,
  diffCalendarDays,
  formatDate,
  formatTimeRange,
  formatWeekday,
  startOfDay,
} from '@/shared/lib/dates';

export interface DayScheduleProps {
  /** Выбранный день. */
  date: Date;
  onDateChange: (date: Date) => void;
  /** Занятия, среди которых ищутся занятия дня (сегодня, ближайшие, месяц календаря). */
  lessons: LessonDto[];
  /** Занятия дня ещё грузятся (день за пределами недели главной). */
  loading?: boolean;
  /** Непрочитанные уведомления — число в колокольчике (колокольчик жёлтый). */
  unreadCount?: number;
  onOpenNotifications?: () => void;
  /** Календарь открыт — иконка подсвечена. */
  calendarOpen?: boolean;
  onToggleCalendar?: () => void;
  /** Строка «календарь · день · колокольчик»: к ней пристыковывается шторка календаря. */
  headerRef?: Ref<HTMLElement>;
  /**
   * Своя вторая колонка вместо группы (главная родителя: «Репетитор» — преподаватель
   * занятия). По умолчанию — название группы, как у ученика.
   */
  secondColumn?: DayScheduleColumn;
  /**
   * Действие под колонкой «Название» (главная родителя: полоса «+ Добавить кружок»).
   * В день без занятий — кнопкой в пустом состоянии.
   */
  nameAction?: CardColumnAction;
}

export interface DayScheduleColumn {
  header: ReactNode;
  cell: (lesson: LessonDto) => ReactNode;
  /** Не переносить (короткие значения вроде «Иванова М.»): ширина колонки — по содержимому. */
  nowrap?: boolean;
}

function dayLabel(date: Date, locale: string, t: (key: string) => string) {
  const offset = diffCalendarDays(new Date(), date);
  if (offset === 0) return t('home.today');
  if (offset === 1) return t('home.tomorrow');
  if (offset === -1) return t('home.yesterday');
  const weekday = formatWeekday(date, locale);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDate(date, locale)}`;
}

/**
 * Расписание дня по макету: «календарь · ‹ Сегодня › · колокольчик» и три карточки-колонки
 * (название кружка, группа, время). Назад — не раньше сегодняшнего дня, вперёд — без
 * ограничений (дальние дни подгружает календарь). Текущее/ближайшее занятие сегодня
 * выделено цветом. Иконка календаря открывает шторку-календарь и подсвечивается.
 */
export function DaySchedule({
  date,
  onDateChange,
  lessons,
  loading = false,
  unreadCount,
  onOpenNotifications,
  calendarOpen = false,
  onToggleCalendar,
  headerRef,
  secondColumn,
  nameAction,
}: DayScheduleProps) {
  const { t, i18n } = useTranslation('student');
  const now = new Date();
  const offset = diffCalendarDays(now, date);
  const label = dayLabel(date, i18n.language, t);

  const dayLessons = lessonsOfDay(lessons, date);
  const highlightedId =
    offset === 0
      ? (dayLessons.find((lesson) => new Date(lesson.endsAt).getTime() > now.getTime())?.id ?? null)
      : null;

  return (
    <Stack gap={5}>
      <Inline ref={headerRef} justify="between" align="center" wrap={false}>
        <IconButton
          aria-label={calendarOpen ? t('home.calendarClose') : t('home.calendar')}
          aria-expanded={calendarOpen}
          onClick={onToggleCalendar}
        >
          <Text as="span" tone={calendarOpen ? 'warning' : 'muted'}>
            <CalendarClockIcon size={30} />
          </Text>
        </IconButton>

        <Inline gap={5} align="center" wrap={false}>
          <IconButton
            aria-label={t('home.prevDay')}
            onClick={() => onDateChange(addDays(startOfDay(date), -1))}
            disabled={offset <= 0}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Text as="span" aria-live="polite">
            {label}
          </Text>
          <IconButton
            aria-label={t('home.nextDay')}
            onClick={() => onDateChange(addDays(startOfDay(date), 1))}
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

      {loading ? (
        <Skeleton height={110} aria-busy="true" />
      ) : dayLessons.length === 0 ? (
        <Card>
          <EmptyState
            title={offset === 0 ? t('home.noLessonsToday') : t('home.noLessonsOnDay')}
            action={
              nameAction && (
                <Button size="sm" leftIcon={<PlusIcon />} onClick={nameAction.onClick}>
                  {nameAction.label}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <CardColumns
          aria-label={label}
          columns={[
            { key: 'name', header: t('home.columns.name'), fit: true, action: nameAction },
            {
              key: 'group',
              header: secondColumn?.header ?? t('home.columns.group'),
              align: 'center',
              nowrap: secondColumn?.nowrap,
            },
            { key: 'time', header: t('home.columns.time'), align: 'center', nowrap: true },
          ]}
          rows={dayLessons.map((lesson) => ({
            key: lesson.id,
            cells: {
              name: lesson.group.club.title,
              group: secondColumn ? secondColumn.cell(lesson) : lesson.group.title,
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
