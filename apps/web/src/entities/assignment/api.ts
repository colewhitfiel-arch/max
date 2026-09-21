import type {
  CreateAssignmentBody,
  ListStudentAssignmentsQuery,
  ListTeacherAssignmentsQuery,
  SubmitAssignmentBody,
} from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, newRequestId } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { assignmentKeys } from './keys';

/** `GET /student/assignments?status`. */
export function useStudentAssignments(query: ListStudentAssignmentsQuery = {}) {
  return useQuery({
    queryKey: assignmentKeys.studentList(query),
    queryFn: () => call(api.assignments.listStudentAssignments({ query })),
  });
}

/** `GET /student/assignments/:id`. */
export function useStudentAssignment(assignmentId: string) {
  return useQuery({
    queryKey: assignmentKeys.studentDetail(assignmentId),
    queryFn: () => call(api.assignments.getStudentAssignment({ params: { assignmentId } })),
  });
}

/** `POST /student/assignments/:id/submit` с Idempotency-Key. */
export function useSubmitAssignment(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitAssignmentBody) =>
      call(
        api.assignments.submitAssignment({
          params: { assignmentId },
          body,
          headers: { 'idempotency-key': newRequestId() },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.student }),
  });
}

/** `GET /teacher/assignments?groupId&status`. */
export function useTeacherAssignments(query: ListTeacherAssignmentsQuery = {}) {
  return useQuery({
    queryKey: assignmentKeys.teacherList(query),
    queryFn: () => call(api.assignments.listTeacherAssignments({ query })),
  });
}

/** `POST /teacher/assignments`. */
export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssignmentBody) => call(api.assignments.createAssignment({ body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.teacher }),
  });
}

/** `GET /teacher/assignments/:id/submissions`. */
export function useAssignmentSubmissions(assignmentId: string) {
  return useQuery({
    queryKey: assignmentKeys.submissions(assignmentId),
    queryFn: () => call(api.assignments.listSubmissions({ params: { assignmentId } })),
  });
}
