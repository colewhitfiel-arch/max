import type { TeacherPerformancePeriod } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const groupKeys = {
  list: () => [...queryKeys.teacher, 'groups'] as const,
  detail: (groupId: string) => [...queryKeys.teacher, 'groups', groupId] as const,
  /** Кого можно добавить в группу (поиск по имени). */
  candidates: (groupId: string, q: string) =>
    [...queryKeys.teacher, 'groups', groupId, 'candidates', q] as const,
  /** «Общая успеваемость» по группам преподавателя за период. */
  performance: (period: TeacherPerformancePeriod) =>
    [...queryKeys.teacher, 'performance', period] as const,
};
