import type { ListTeacherCoursesQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const courseKeys = {
  studentList: () => [...queryKeys.student, 'courses'] as const,
  studentDetail: (courseId: string) => [...queryKeys.student, 'courses', courseId] as const,
  studentBlock: (blockId: string) => [...queryKeys.student, 'blocks', blockId] as const,
  teacherList: (query: ListTeacherCoursesQuery) =>
    [...queryKeys.teacher, 'courses', query] as const,
  teacherDetail: (courseId: string) => [...queryKeys.teacher, 'courses', courseId] as const,
};
