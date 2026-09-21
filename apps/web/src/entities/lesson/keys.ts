import type { PeriodQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const lessonKeys = {
  studentCalendar: (period: PeriodQuery) => [...queryKeys.student, 'calendar', period] as const,
  childCalendar: (studentId: string, period: PeriodQuery) =>
    [...queryKeys.parent(studentId), 'calendar', period] as const,
  groupLessons: (groupId: string, period: PeriodQuery) =>
    [...queryKeys.teacher, 'groups', groupId, 'lessons', period] as const,
};
