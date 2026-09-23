import { Skeleton } from '@edu/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChildCalendar } from '@/entities/lesson';
import { useNotifications } from '@/entities/notification';
import { shortName, useParentHome } from '@/entities/student';
import { diffCalendarDays, startOfDay, toDateOnly } from '@/shared/lib/dates';
import { QueryError } from '@/shared/ui';
import { StudentCalendarSheet } from '@/widgets/student-home-calendar';
import { NotificationsDrawer } from '@/widgets/student-home-notifications';
import { DaySchedule } from '@/widgets/student-home-schedule';

/** Сегодня + 6 дней: столько покрывают `today`/`upcoming` главной, дальше — календарь. */
const HOME_WINDOW_DAYS = 7;

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthPeriod = (month: Date) => ({
  from: toDateOnly(month),
  to: toDateOnly(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
});

export interface ParentHomeScheduleProps {
  /** Выбранный ребёнок. */
  studentId: string;
  /** «Добавить кружок» под колонкой названий — предложения кружков. */
  onAddClub: () => void;
}

/**
 * Расписание ребёнка на главной родителя — та же логика, что у ученика: «календарь ·
 * ‹ Сегодня › · колокольчик», шторка-календарь месяца и панель уведомлений. Колонки:
 * Название (с полосой «Добавить кружок») / Репетитор / Время. Неделя —
 * `GET /parent/children/:id/home`, другие дни и открытый календарь — `…/calendar`.
 */
export function ParentHomeSchedule({ studentId, onAddClub }: ParentHomeScheduleProps) {
  const { t } = useTranslation('parent-home');
  const home = useParentHome(studentId);
  const [day, setDay] = useState(() => startOfDay());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const scheduleHeaderRef = useRef<HTMLElement>(null);

  // Бейдж колокольчика; в real-режиме до workstream L ручки нет — колокольчик просто серый.
  const unread = useNotifications({ unreadOnly: true });
  const unreadCount = unread.data?.unreadCount ?? 0;

  const offset = diffCalendarDays(new Date(), day);
  const outsideHome = offset < 0 || offset >= HOME_WINDOW_DAYS;
  const calendarMonth = calendarOpen ? month : monthStart(day);
  const calendar = useChildCalendar(studentId, monthPeriod(calendarMonth), {
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
          header: t('schedule.teacher'),
          cell: (lesson) => shortName(lesson.group.teacher.user),
          nowrap: true,
        }}
        nameAction={{ label: t('schedule.addClub'), onClick: onAddClub }}
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
      />
      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
