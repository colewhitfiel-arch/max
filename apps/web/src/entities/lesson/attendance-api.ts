import type { MarkAttendanceBody } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { lessonKeys } from './keys';

/** `GET /teacher/lessons/:lessonId/attendance` — лист занятия со всем составом группы. */
export function useAttendanceSheet(lessonId: string) {
  return useQuery({
    queryKey: lessonKeys.attendance(lessonId),
    queryFn: () => call(api.attendance.getAttendanceSheet({ params: { lessonId } })),
    enabled: !!lessonId,
  });
}

/**
 * `PUT /teacher/lessons/:lessonId/attendance` — отметить весь лист разом (upsert, занятие → DONE).
 * После успеха обновляем и сам лист, и всё, что зависит от посещаемости: календарь, группы,
 * успеваемость.
 */
export function useMarkAttendance(lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkAttendanceBody) =>
      call(api.attendance.markAttendance({ params: { lessonId }, body })),
    onSuccess: (sheet) => {
      queryClient.setQueryData(lessonKeys.attendance(lessonId), sheet);
      void queryClient.invalidateQueries({ queryKey: queryKeys.teacher });
    },
  });
}
