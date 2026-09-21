import type { PeriodQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const studentKeys = {
  children: () => [...queryKeys.parentRoot, 'children'] as const,
  parentHome: (studentId: string) => [...queryKeys.parent(studentId), 'home'] as const,
  childAnalytics: (studentId: string, period: PeriodQuery) =>
    [...queryKeys.parent(studentId), 'analytics', period] as const,
  teacherStudent: (studentId: string) => [...queryKeys.teacher, 'students', studentId] as const,
};
