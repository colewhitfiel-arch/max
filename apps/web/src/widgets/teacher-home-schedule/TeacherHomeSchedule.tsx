import type { LessonDto } from '@edu/contracts';
import { Skeleton } from '@edu/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherHome } from '@/entities/dashboard';
import { useTeacherCalendar } from '@/entities/lesson';
import { useNotifications } from '@/entities/notification';
import { diffCalendarDays, startOfDay, toDateOnly } from '@/shared/lib/dates';
import { QueryError } from '@/shared/ui';
import { StudentCalendarSheet } from '@/widgets/student-home-calendar';
import { NotificationsDrawer } from '@/widgets/student-home-notifications';
import { DaySchedule } from '@/widgets/student-home-schedule';

/** Сегодня + 6 дней: столько по контракту покрывают `today`/`upcoming` главной, дальше — календарь. */
const HOME_WINDOW_DAYS = 7;

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthPeriod = (month: Date) => ({
  from: toDateOnly(month),
  to: toDateOnly(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
});

/**
 * Сколько дней от сегодня полностью покрывает главная. `today` — весь сегодняшний день, а
 * `upcoming` ограничен и по числу занятий (docs/05: «7 дней, ≤ 10»): у репетитора с несколькими
 * группами список обрывается внутри недели, и день последнего занятия в нём может быть неполным.
 * Поэтому окно — до этого дня (не включая); с него и дальше занятия берутся из календаря.
 */
function homeWindowDays(upcoming: LessonDto[], now: Date): number {
  const lastOffset = upcoming.reduce(
    (max, lesson) => Math.max(max, diffCalendarDays(now, lesson.startsAt)),
    0,
  );
  return Math.max(1, Math.min(HOME_WINDOW_DAYS, lastOffset));
}

/**
 * Расписание репетитора на главной (макет): «календарь · ‹ Сегодня › · колокольчик», шторка
 * календаря месяца и панель уведомлений — как у ученика и родителя, но занятия всех групп
 * преподавателя. Колонки: Название / Группа (короткий код «001», без кода — название группы) /
 * Время; нечётные строки подложены полосой. Неделя — `GET /teacher/home`, другие дни и открытый
 * календарь — `GET /teacher/calendar`.
 */
export function TeacherHomeSchedule() {
  const { t } = useTranslation('student');
  const home = useTeacherHome();
  const [day, setDay] = useState(() => startOfDay());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const scheduleHeaderRef = useRef<HTMLElement>(null);

  // Бейдж колокольчика; в real-режиме до workstream L ручки нет — колокольчик просто серый.
  const unread = useNotifications({ unreadOnly: true });
  const unreadCount = unread.data?.unreadCount ?? 0;

  const now = new Date();
  const offset = diffCalendarDays(now, day);
  const windowDays = home.data ? homeWindowDays(home.data.upcoming, now) : HOME_WINDOW_DAYS;
  const outsideHome = offset < 0 || offset >= windowDays;
  const calendarMonth = calendarOpen ? month : monthStart(day);
  const calendar = useTeacherCalendar(monthPeriod(calendarMonth), {
    enabled: calendarOpen || outsideHome,
  });

  if (home.isPending) return <Skeleton height={150} aria-busy="true" />;
  if (home.isError) return <QueryError error={home.error} onRetry={() => void home.refetch()} />;

  const lessons = [...home.data.today, ...home.data.upcoming, ...(calendar.data?.lessons ?? [])];

  const selectDay = (next: Date) => {
    setDay(startOfDay(next));
    setMonth(monthStart(next));
  };

  return (
    <>
      <DaySchedule
        headerRef={scheduleHeaderRef}
        date={day}
        onDateChange={selectDay}
        lessons={lessons}
        loading={outsideHome && calendar.isPending}
        // Вне окна главной день целиком из календаря: его сбой (в real-режиме ручки пока нет)
        // — ошибка, а не ложное «нет занятий» или неполный список из `upcoming`.
        error={outsideHome && calendar.isError ? calendar.error : undefined}
        onRetry={() => void calendar.refetch()}
        unreadCount={unreadCount}
        onOpenNotifications={() => {
          setCalendarOpen(false);
          setNotificationsOpen(true);
        }}
        calendarOpen={calendarOpen}
        onToggleCalendar={() => {
          if (!calendarOpen) setMonth(monthStart(day));
          setCalendarOpen(!calendarOpen);
        }}
        secondColumn={{
          header: t('home.columns.group'),
          cell: (lesson) => lesson.group.code ?? lesson.group.title,
          nowrap: true,
        }}
        striped
      />
      <StudentCalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        anchorRef={scheduleHeaderRef}
        date={day}
        onDateChange={selectDay}
        month={month}
        onMonthChange={setMonth}
        lessons={calendar.data?.lessons}
        error={calendar.isError}
        onRetry={() => void calendar.refetch()}
      />
      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
