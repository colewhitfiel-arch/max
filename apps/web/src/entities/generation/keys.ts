import { queryKeys } from '@/shared/api/query-keys';

export const generationKeys = {
  list: () => [...queryKeys.teacher, 'course-builder', 'jobs'] as const,
  detail: (jobId: string) => [...queryKeys.teacher, 'course-builder', 'jobs', jobId] as const,
};
