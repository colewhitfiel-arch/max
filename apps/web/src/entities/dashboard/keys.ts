import { queryKeys } from '@/shared/api/query-keys';

export const dashboardKeys = {
  studentHome: () => [...queryKeys.student, 'home'] as const,
  studentProfile: () => [...queryKeys.student, 'profile'] as const,
  teacherHome: () => [...queryKeys.teacher, 'home'] as const,
  health: () => [...queryKeys.health] as const,
};
