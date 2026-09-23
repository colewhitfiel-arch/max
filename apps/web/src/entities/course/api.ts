import type { CompleteBlockBody, CreateCourseBody, ListTeacherCoursesQuery } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { courseKeys } from './keys';

/** `GET /student/courses`. */
export function useStudentCourses() {
  return useQuery({
    queryKey: courseKeys.studentList(),
    queryFn: () => call(api.courses.listStudentCourses()),
  });
}

/** `GET /student/courses/:courseId`. */
export function useStudentCourse(courseId: string) {
  return useQuery({
    queryKey: courseKeys.studentDetail(courseId),
    queryFn: () => call(api.courses.getStudentCourse({ params: { courseId } })),
  });
}

/** `GET /student/blocks/:blockId`. */
export function useStudentBlock(blockId: string) {
  return useQuery({
    queryKey: courseKeys.studentBlock(blockId),
    queryFn: () => call(api.courses.getStudentBlock({ params: { blockId } })),
  });
}

/** `POST /student/blocks/:blockId/open`. */
export function useOpenBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockId: string) => call(api.courses.openBlock({ params: { blockId } })),
    onSuccess: (_result, blockId) =>
      queryClient.invalidateQueries({ queryKey: courseKeys.studentBlock(blockId) }),
  });
}

/** `POST /student/blocks/:blockId/complete`. */
export function useCompleteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, body }: { blockId: string; body: CompleteBlockBody }) =>
      call(api.courses.completeBlock({ params: { blockId }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.student }),
  });
}

/** `GET /teacher/courses?groupId`. */
export function useTeacherCourses(query: ListTeacherCoursesQuery = {}) {
  return useQuery({
    queryKey: courseKeys.teacherList(query),
    queryFn: () => call(api.courses.listTeacherCourses({ query })),
  });
}

/** `GET /teacher/courses/:courseId`. */
export function useTeacherCourse(courseId: string) {
  return useQuery({
    queryKey: courseKeys.teacherDetail(courseId),
    queryFn: () => call(api.courses.getTeacherCourse({ params: { courseId } })),
  });
}

/** `POST /teacher/courses`. */
export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCourseBody) => call(api.courses.createCourse({ body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.teacher }),
  });
}
