import { Screen, VisuallyHidden } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStudentHome } from '@/entities/dashboard';
import { useNotifications } from '@/entities/notification';
import { AsyncState, DashboardSkeleton } from '@/shared/ui';
import { AttendanceWeekCard } from '@/widgets/student-home-attendance';
import { StudentHomeHero } from '@/widgets/student-home-hero';
import { DaySchedule } from '@/widgets/student-home-schedule';
import { StudentHomeStats } from '@/widgets/student-home-stats';

/**
 * `/student` — главный экран ученика по макету Figma: серия/баллы, дуга посещений за неделю,
 * маскот, расписание по дням с колокольчиком уведомлений. Данные — `GET /student/home` (F2).
 */
export function StudentHomePage() {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const query = useStudentHome();
  // Счётчик в колокольчике; в real-режиме до workstream L ручки нет — бейдж просто не показывается.
  const notifications = useNotifications({ unreadOnly: true });
  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <Screen gap={5}>
      <VisuallyHidden as="h1">{t('home.title')}</VisuallyHidden>
      <AsyncState query={query} skeleton={<DashboardSkeleton />}>
        {(home) => (
          <>
            <StudentHomeStats streakDays={home.streakDays} points={home.points} />
            {home.week && home.week.length > 0 && <AttendanceWeekCard week={home.week} />}
            <StudentHomeHero />
            <DaySchedule
              today={home.today}
              upcoming={home.upcoming}
              unreadCount={unreadCount}
              onOpenNotifications={() => navigate('/notifications')}
            />
          </>
        )}
      </AsyncState>
    </Screen>
  );
}
