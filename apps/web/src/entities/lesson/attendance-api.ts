import {
  ATTENDANCE_QR_REFRESH_SEC,
  type CheckInBody,
  type MarkAttendanceBody,
} from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { lessonKeys } from './keys';

/**
 * `GET /teacher/lessons/:lessonId/attendance` — лист занятия со всем составом группы.
 * `refetchInterval` — живой лист (экран QR-кода: кто уже отметился).
 */
export function useAttendanceSheet(lessonId: string, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: lessonKeys.attendance(lessonId),
    queryFn: () => call(api.attendance.getAttendanceSheet({ params: { lessonId } })),
    enabled: !!lessonId,
    refetchInterval: options.refetchInterval,
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

/**
 * `GET /teacher/lessons/:lessonId/attendance/qr` — QR-код занятия. Код живёт недолго, поэтому
 * берётся заново каждые `ATTENDANCE_QR_REFRESH_SEC` и не переживает уход с экрана (старый код
 * при возврате не показывается ни на миг).
 */
export function useAttendanceQr(lessonId: string) {
  return useQuery({
    queryKey: lessonKeys.attendanceQr(lessonId),
    queryFn: () => call(api.attendance.getAttendanceQr({ params: { lessonId } })),
    enabled: !!lessonId,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: ATTENDANCE_QR_REFRESH_SEC * 1000,
  });
}

/**
 * `POST /student/attendance/check-in` — ученик отмечается по коду из QR. После успеха
 * обновляем всё ученическое: главную (дуга недели, серия, кристаллы) и календарь.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckInBody) => call(api.attendance.checkIn({ body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.student });
    },
  });
}
