import type {
  CompleteBlockBody,
  CreateCourseBody,
  ListTeacherCoursesQuery,
  PublishCourseBody,
} from '@edu/contracts';
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

/** `GET /student/courses/:courseId`; `enabled: false` — курс ещё неизвестен (плеер ждёт блок). */
export function useStudentCourse(courseId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: courseKeys.studentDetail(courseId),
    queryFn: () => call(api.courses.getStudentCourse({ params: { courseId } })),
    enabled: options.enabled ?? true,
  });
}

/**
 * `GET /student/blocks/:blockId`. `enabled: false` — когда блока нет (задание преподавателя
 * без курса): запрос не уходит, а хук всё равно вызывается на каждом рендере.
 */
export function useStudentBlock(blockId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: courseKeys.studentBlock(blockId),
    queryFn: () => call(api.courses.getStudentBlock({ params: { blockId } })),
    enabled: options.enabled ?? true,
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

/**
 * `POST /teacher/courses/:courseId/publish`: курс виден ученикам группы, блоки-задания
 * (тест, вопрос, практика, ДЗ) становятся заданиями. Без параметров — всей группе, без срока.
 */
export function usePublishCourse(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PublishCourseBody) =>
      call(api.courses.publishCourse({ params: { courseId }, body })),
    onSuccess: (course) => {
      queryClient.setQueryData(courseKeys.teacherDetail(courseId), course);
      return queryClient.invalidateQueries({ queryKey: queryKeys.teacher });
    },
  });
}

/** `POST /teacher/courses/:courseId/archive`: курс пропадает у учеников. */
export function useArchiveCourse(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.courses.archiveCourse({ params: { courseId } })),
    onSuccess: (course) => {
      queryClient.setQueryData(courseKeys.teacherDetail(courseId), course);
      return queryClient.invalidateQueries({ queryKey: queryKeys.teacher });
    },
  });
}

/** `GET /teacher/courses/:courseId/progress` — прогресс учеников группы по курсу. */
export function useCourseProgress(courseId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: courseKeys.teacherProgress(courseId),
    queryFn: () => call(api.courses.getCourseProgress({ params: { courseId } })),
    enabled: options.enabled ?? true,
  });
}
