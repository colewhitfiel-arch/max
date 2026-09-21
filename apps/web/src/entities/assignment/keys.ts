import type { ListStudentAssignmentsQuery, ListTeacherAssignmentsQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const assignmentKeys = {
  studentList: (query: ListStudentAssignmentsQuery) =>
    [...queryKeys.student, 'assignments', query] as const,
  studentDetail: (assignmentId: string) =>
    [...queryKeys.student, 'assignments', 'detail', assignmentId] as const,
  teacherList: (query: ListTeacherAssignmentsQuery) =>
    [...queryKeys.teacher, 'assignments', query] as const,
  submissions: (assignmentId: string) =>
    [...queryKeys.teacher, 'assignments', assignmentId, 'submissions'] as const,
};
