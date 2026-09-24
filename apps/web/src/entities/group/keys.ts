import type { TeacherPerformancePeriod } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const groupKeys = {
  list: () => [...queryKeys.teacher, 'groups'] as const,
  detail: (groupId: string) => [...queryKeys.teacher, 'groups', groupId] as const,
  /** «Общая успеваемость» по группам преподавателя за период. */
  performance: (period: TeacherPerformancePeriod) =>
    [...queryKeys.teacher, 'performance', period] as const,
};
