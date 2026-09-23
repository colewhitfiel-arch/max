import type { TeacherPerformancePeriod } from '@edu/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { groupKeys } from './keys';

/** `GET /teacher/groups`. */
export function useTeacherGroups() {
  return useQuery({
    queryKey: groupKeys.list(),
    queryFn: () => call(api.dashboards.listTeacherGroups()),
  });
}

/** `GET /teacher/groups/:groupId`. */
export function useTeacherGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => call(api.dashboards.getTeacherGroup({ params: { groupId } })),
  });
}

/**
 * `GET /teacher/performance?period=day|week|month|course` — «Общая успеваемость»: посещения и
 * задания по каждой группе преподавателя за период (счётчики считает analytics, docs/04 §4.6).
 * Смена периода не мигает скелетом: до ответа видны данные прежнего периода
 * (`isPlaceholderData`).
 */
export function useTeacherPerformance(period: TeacherPerformancePeriod) {
  return useQuery({
    queryKey: groupKeys.performance(period),
    queryFn: () => call(api.dashboards.getTeacherPerformance({ query: { period } })),
    placeholderData: keepPreviousData,
  });
}
