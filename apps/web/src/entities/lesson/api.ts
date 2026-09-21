import type { PeriodQuery, UpdateLessonBody } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { lessonKeys } from './keys';

/** `GET /student/calendar?from&to`. */
export function useStudentCalendar(period: PeriodQuery) {
  return useQuery({
    queryKey: lessonKeys.studentCalendar(period),
    queryFn: () => call(api.groups.getStudentCalendar({ query: period })),
  });
}

/** `GET /parent/children/:studentId/calendar`. */
export function useChildCalendar(studentId: string | null, period: PeriodQuery) {
  return useQuery({
    queryKey: lessonKeys.childCalendar(studentId ?? '', period),
    queryFn: () =>
      call(api.groups.getParentChildCalendar({ params: { studentId: studentId! }, query: period })),
    enabled: !!studentId,
  });
}

/** `GET /teacher/groups/:groupId/lessons`. */
export function useTeacherLessons(groupId: string, period: PeriodQuery) {
  return useQuery({
    queryKey: lessonKeys.groupLessons(groupId, period),
    queryFn: () => call(api.groups.listGroupLessons({ params: { groupId }, query: period })),
  });
}

/** `PATCH /teacher/lessons/:lessonId` (тема/кабинет/отмена). */
export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, body }: { lessonId: string; body: UpdateLessonBody }) =>
      call(api.groups.updateLesson({ params: { lessonId }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.teacher }),
  });
}
