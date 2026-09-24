/**
 * Хуки экранов «Успеваемость» родителя и преподавателя (дуга посещений, домашние задачи,
 * подробности заданий). Отдельный файл, чтобы не пересекаться с хуками главной/детей в `api.ts`.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { lastDaysPeriod } from '@/shared/lib/dates';
import { studentKeys } from './keys';

/**
 * Окно запроса аналитики для экрана успеваемости. Дуга недели, итоги и сетки заданий от окна
 * не зависят (docs/04 §4.6), поэтому окно фиксированное — 30 дней.
 */
export const PERFORMANCE_PERIOD_DAYS = 30;

export const analyticsKeys = {
  groupTasks: (studentId: string, groupId: string) =>
    [...queryKeys.parent(studentId), 'groups', groupId, 'tasks'] as const,
};

/**
 * `GET /parent/children/:studentId/analytics` за последние 30 дней: `week`, `homework`,
 * `clubHomework` для экрана успеваемости.
 */
export function useChildPerformance(studentId: string | null) {
  // Период фиксируется на время жизни экрана, чтобы ключ запроса не менялся между рендерами.
  const period = useMemo(() => lastDaysPeriod(PERFORMANCE_PERIOD_DAYS), []);
  return useQuery({
    queryKey: studentKeys.childAnalytics(studentId ?? '', period),
    queryFn: () =>
      call(
        api.dashboards.getParentChildAnalytics({
          params: { studentId: studentId! },
          query: period,
        }),
      ),
    enabled: !!studentId,
  });
}

/** `GET /parent/children/:studentId/groups/:groupId/tasks` — условия, ответы и статусы заданий. */
export function useChildGroupTasks(studentId: string | null, groupId: string | null) {
  return useQuery({
    queryKey: analyticsKeys.groupTasks(studentId ?? '', groupId ?? ''),
    queryFn: () =>
      call(
        api.dashboards.getParentChildGroupTasks({
          params: { studentId: studentId!, groupId: groupId! },
        }),
      ),
    enabled: !!studentId && !!groupId,
  });
}

/**
 * `GET /teacher/students/:studentId/groups/:groupId/tasks` — задания группы преподавателя по
 * ученику: условия, ответы, эталоны и статусы. Ученик не из групп преподавателя или чужая
 * группа — `FORBIDDEN` (экран показывает «Ученик не в ваших группах»).
 */
export function useTeacherStudentGroupTasks(studentId: string | null, groupId: string | null) {
  return useQuery({
    queryKey: studentKeys.teacherStudentGroupTasks(studentId ?? '', groupId ?? ''),
    queryFn: () =>
      call(
        api.dashboards.getTeacherStudentGroupTasks({
          params: { studentId: studentId!, groupId: groupId! },
        }),
      ),
    enabled: !!studentId && !!groupId,
  });
}
