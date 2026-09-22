import type { StudentHomeDto } from '@edu/contracts';
import { Screen, VisuallyHidden } from '@edu/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentHome } from '@/entities/dashboard';
import { lessonsOfDay, useStudentCalendar } from '@/entities/lesson';
import { useNotifications } from '@/entities/notification';
import { diffCalendarDays, startOfDay, toDateOnly } from '@/shared/lib/dates';
import { AsyncState, DashboardSkeleton } from '@/shared/ui';
import { AttendanceWeekCard } from '@/widgets/student-home-attendance';
import { StudentCalendarSheet } from '@/widgets/student-home-calendar';
import { StudentHomeHero } from '@/widgets/student-home-hero';
import { NotificationsDrawer } from '@/widgets/student-home-notifications';
import { DaySchedule } from '@/widgets/student-home-schedule';
import { StudentHomeStats } from '@/widgets/student-home-stats';

/** Сегодня + 6 дней: столько покрывают `today`/`upcoming` главной, дальше — календарь. */
const HOME_WINDOW_DAYS = 7;

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthPeriod = (month: Date) => ({
  from: toDateOnly(month),
  to: toDateOnly(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
});

function StudentHomeContent({ home }: { home: StudentHomeDto }) {
  const [day, setDay] = useState(() => startOfDay());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const scheduleHeaderRef = useRef<HTMLElement>(null);

  // Бейдж колокольчика; в real-режиме до workstream L ручки нет — колокольчик просто серый.
  const unread = useNotifications({ unreadOnly: true });
  const unreadCount = unread.data?.unreadCount ?? 0;

  // Дни за пределами недели главной и открытый календарь берут занятия из календаря месяца.
  const offset = diffCalendarDays(new Date(), day);
  const outsideHome = offset < 0 || offset >= HOME_WINDOW_DAYS;
  const calendarMonth = calendarOpen ? month : monthStart(day);
  const calendar = useStudentCalendar(monthPeriod(calendarMonth), {
    enabled: calendarOpen || outsideHome,
  });

  const lessons = [...home.today, ...home.upcoming, ...(calendar.data?.lessons ?? [])];
  const dayLessons = lessonsOfDay(lessons, day);

  const selectDay = (next: Date) => {
    setDay(startOfDay(next));
    setMonth(monthStart(next));
  };

  return (
    <>
      <StudentHomeStats streakDays={home.streakDays} points={home.points} />
      {home.week && home.week.length > 0 && <AttendanceWeekCard week={home.week} />}
      <StudentHomeHero
        subjects={dayLessons.map((lesson) => lesson.group.club)}
        allSubjects={home.clubs.map((item) => item.club)}
      />
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

/**
 * `/student` — главный экран ученика по макету Figma: серия/валюта, дуга посещений за неделю,
 * иконки предметов выбранного дня, расписание по дням с календарём-шторкой и колокольчиком
 * (боковая панель уведомлений). Данные — `GET /student/home` (+ `GET /student/calendar`).
 */
export function StudentHomePage() {
  const { t } = useTranslation('student');
  const query = useStudentHome();

  return (
    <Screen gap={6}>
      <VisuallyHidden as="h1">{t('home.title')}</VisuallyHidden>
      <AsyncState query={query} skeleton={<DashboardSkeleton />}>
        {(home) => <StudentHomeContent home={home} />}
      </AsyncState>
    </Screen>
  );
}
