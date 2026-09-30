import type { LessonDto, StudentHomeDto } from '@edu/contracts';
import { Screen, VisuallyHidden } from '@edu/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentHome } from '@/entities/dashboard';
import { lessonsOfDay, useStudentCalendar } from '@/entities/lesson';
import { useNotifications } from '@/entities/notification';
import { QrCheckInButton } from '@/features/qr-check-in';
import { diffCalendarDays, startOfDay, toDateOnly } from '@/shared/lib/dates';
import { AsyncState, DashboardSkeleton } from '@/shared/ui';
import { AttendanceWeekCard } from '@/widgets/student-home-attendance';
import { StudentCalendarSheet } from '@/widgets/student-home-calendar';
import { StudentHomeHero } from '@/widgets/student-home-hero';
import { NotificationsDrawer } from '@/widgets/student-home-notifications';
import { DaySchedule } from '@/widgets/student-home-schedule';
import { StudentHomeStats } from '@/widgets/student-home-stats';

/** Сегодня + 6 дней: столько по контракту покрывают `today`/`upcoming` главной, дальше — календарь. */
const HOME_WINDOW_DAYS = 7;
/** `upcoming` главной — не более 10 занятий (контракт `StudentHomeDto`). */
const HOME_UPCOMING_LIMIT = 10;

/**
 * Сколько дней от сегодня полностью покрывает главная. Если `upcoming` упёрся в лимит, список
 * обрывается внутри недели и день его последнего занятия может быть неполным — окно до этого
 * дня (не включая), с него и дальше занятия берутся из календаря.
 */
function homeWindowDays(upcoming: LessonDto[], now: Date): number {
  if (upcoming.length < HOME_UPCOMING_LIMIT) return HOME_WINDOW_DAYS;
  const lastOffset = upcoming.reduce(
    (max, lesson) => Math.max(max, diffCalendarDays(now, lesson.startsAt)),
    0,
  );
  return Math.max(1, Math.min(HOME_WINDOW_DAYS, lastOffset));
}

/**
 * Сегодня есть занятие, на котором ученик ещё не отмечен «был»/«опоздал», — показываем
 * «Отметиться по QR» (docs/07 F6a). Отметился на всех — кнопка уходит.
 */
function needsCheckIn(today: LessonDto[]): boolean {
  return today.some(
    (lesson) =>
      lesson.status !== 'CANCELLED' &&
      lesson.attendance !== 'PRESENT' &&
      lesson.attendance !== 'LATE',
  );
}

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

  // Дни за пределами недели главной берут занятия из календаря месяца выбранного дня, шторка —
  // из календаря показываемого месяца. Запросы раздельные, чтобы листание месяцев в шторке не
  // сбрасывало уже загруженный день; при одном месяце TanStack Query делит один запрос.
  const now = new Date();
  const offset = diffCalendarDays(now, day);
  const outsideHome = offset < 0 || offset >= homeWindowDays(home.upcoming, now);
  const dayCalendar = useStudentCalendar(monthPeriod(monthStart(day)), { enabled: outsideHome });
  const sheetCalendar = useStudentCalendar(monthPeriod(month), { enabled: calendarOpen });

  const lessons = [
    ...home.today,
    ...home.upcoming,
    ...(dayCalendar.data?.lessons ?? []),
    ...(sheetCalendar.data?.lessons ?? []),
  ];
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
        subjects={dayLessons
          .filter((lesson) => lesson.status !== 'CANCELLED')
          .map((lesson) => lesson.group.club)}
        allSubjects={home.clubs.map((item) => item.club)}
      />
      {needsCheckIn(home.today) && <QrCheckInButton />}
      <DaySchedule
        headerRef={scheduleHeaderRef}
        date={day}
        onDateChange={selectDay}
        lessons={lessons}
        loading={outsideHome && dayCalendar.isPending}
        // Вне окна главной день целиком из календаря: его сбой — ошибка с повтором, а не ложное
        // «нет занятий».
        error={outsideHome && dayCalendar.isError ? dayCalendar.error : undefined}
        onRetry={() => void dayCalendar.refetch()}
        fit
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
        lessons={sheetCalendar.data?.lessons}
        selectedDayLessons={outsideHome && !dayCalendar.data ? undefined : lessons}
        error={sheetCalendar.isError}
        onRetry={() => void sheetCalendar.refetch()}
      />
      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}

/**
 * `/student` — главный экран ученика по макету Figma: серия/валюта, дуга посещений за неделю,
 * иконки предметов выбранного дня, расписание по дням с календарём-шторкой и колокольчиком
 * (боковая панель уведомлений). Данные — `GET /student/home` (+ `GET /student/calendar`).
 * Экран вписан в высоту окна без скролла (`Screen fit`): иллюстрации занимают, сколько
 * останется, а длинное расписание прокручивается внутри своей карточки.
 */
export function StudentHomePage() {
  const { t } = useTranslation('student');
  const query = useStudentHome();

  return (
    <Screen gap={5} fit>
      <VisuallyHidden as="h1">{t('home.title')}</VisuallyHidden>
      <AsyncState query={query} skeleton={<DashboardSkeleton />}>
        {(home) => <StudentHomeContent home={home} />}
      </AsyncState>
    </Screen>
  );
}
