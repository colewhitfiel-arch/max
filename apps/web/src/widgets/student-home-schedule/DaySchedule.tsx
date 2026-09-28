import type { LessonDto } from '@edu/contracts';
import {
  Badge,
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
import { groupLabel } from '@/entities/group';
import { lessonsOfDay } from '@/entities/lesson';
import {
  addDays,
  diffCalendarDays,
  formatDate,
  formatTimeRange,
  formatWeekday,
  startOfDay,
} from '@/shared/lib/dates';
import { QueryError } from '@/shared/ui';

export interface DayScheduleProps {
  /** Выбранный день. */
  date: Date;
  onDateChange: (date: Date) => void;
  /** Занятия, среди которых ищутся занятия дня (сегодня, ближайшие, месяц календаря). */
  lessons: LessonDto[];
  /** Занятия дня ещё грузятся (день за пределами недели главной). */
  loading?: boolean;
  /**
   * Занятия дня не загрузились (день за пределами недели главной, сбой календаря): вместо
   * таблицы и «нет занятий» — ошибка с повтором, строка «‹ день ›» остаётся, чтобы вернуться.
   */
  error?: unknown;
  onRetry?: () => void;
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
   * занятия). По умолчанию — группа: короткий код «001», без кода — название группы; колонка
   * не переносится, если у всех групп дня есть код (иначе длинные названия рвутся по буквам).
   */
  secondColumn?: DayScheduleColumn;
  /**
   * Действие под колонкой «Название» (главная родителя: полоса «+ Добавить кружок»).
   * В день без занятий — кнопкой в пустом состоянии.
   */
  nameAction?: CardColumnAction;
  /**
   * «Зебра» таблицы: нечётные строки (1-я, 3-я…) подложены полосой на всю ширину карточек
   * (главная репетитора). По умолчанию выключена — у ученика и родителя строк без полос.
   */
  striped?: boolean;
  /**
   * Плотная таблица на экранах до 414px (CardColumns `dense`): для трёх широких колонок
   * (главная родителя), где иначе длинное название кружка рвётся на 390px.
   */
  dense?: boolean;
  /**
   * Экран без скролла (`Screen fit`, главная ученика): строка «‹ день ›» остаётся на месте,
   * а таблица, если не влезает по высоте, сжимается и прокручивается сама. По умолчанию выкл.
   */
  fit?: boolean;
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

/** Тело расписания (таблица, пусто, ошибка): с `fit` сжимается и прокручивается само. */
function ScheduleBody({ fit, children }: { fit: boolean; children: ReactNode }) {
  if (!fit) return <>{children}</>;
  return (
    <Stack gap={0} scroll>
      {children}
    </Stack>
  );
}

/**
 * Расписание дня по макету: «календарь · ‹ Сегодня › · колокольчик» и три карточки-колонки
 * (название кружка, группа, время). Из сегодня назад не листается, вперёд — без
 * ограничений (дальние дни подгружает календарь); прошедший день, выбранный в календаре,
 * листается в обе стороны. Текущее/ближайшее занятие сегодня выделено цветом (отменённые не
 * в счёт); отменённое занятие — с бейджем «Отменено» и приглушённым временем. Иконка календаря открывает шторку-календарь и подсвечивается.
 */
export function DaySchedule({
  date,
  onDateChange,
  lessons,
  loading = false,
  error,
  onRetry,
  unreadCount,
  onOpenNotifications,
  calendarOpen = false,
  onToggleCalendar,
  headerRef,
  secondColumn,
  nameAction,
  striped = false,
  dense = false,
  fit = false,
}: DayScheduleProps) {
  const { t, i18n } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const now = new Date();
  const offset = diffCalendarDays(now, date);
  const label = dayLabel(date, i18n.language, t);

  const dayLessons = lessonsOfDay(lessons, date);
  const highlightedId =
    offset === 0
      ? (dayLessons.find(
          (lesson) =>
            lesson.status !== 'CANCELLED' && new Date(lesson.endsAt).getTime() > now.getTime(),
        )?.id ?? null)
      : null;

  return (
    <Stack gap={5} scroll={fit}>
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
            disabled={offset === 0}
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

      <ScheduleBody fit={fit}>
        {loading ? (
          <Skeleton height={110} aria-busy="true" />
        ) : error != null ? (
          <QueryError error={error} onRetry={onRetry} />
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
            striped={striped}
            dense={dense}
            columns={[
              { key: 'name', header: t('home.columns.name'), fit: true, action: nameAction },
              {
                key: 'group',
                header: secondColumn?.header ?? t('home.columns.group'),
                align: 'center',
                nowrap: secondColumn
                  ? secondColumn.nowrap
                  : dayLessons.every((lesson) => lesson.group.code != null),
              },
              { key: 'time', header: t('home.columns.time'), align: 'center', nowrap: true },
            ]}
            rows={dayLessons.map((lesson) => {
              const cancelled = lesson.status === 'CANCELLED';
              return {
                key: lesson.id,
                cells: {
                  name: cancelled ? (
                    <Stack gap={1} align="start">
                      {/* small — размер ячейки (14px, в узкой таблице 13px), а не body 16px. */}
                      <Text as="span" variant="small" tone="muted">
                        {lesson.group.club.title}
                      </Text>
                      <Badge tone="danger">{tc('lesson.cancelled')}</Badge>
                    </Stack>
                  ) : (
                    lesson.group.club.title
                  ),
                  group: secondColumn ? secondColumn.cell(lesson) : groupLabel(lesson.group),
                  time: (
                    <Text
                      as="span"
                      variant="small"
                      tone={
                        cancelled ? 'muted' : lesson.id === highlightedId ? 'primary' : 'default'
                      }
                    >
                      {formatTimeRange(lesson.startsAt, lesson.endsAt, i18n.language)}
                    </Text>
                  ),
                },
              };
            })}
          />
        )}
      </ScheduleBody>
    </Stack>
  );
}
