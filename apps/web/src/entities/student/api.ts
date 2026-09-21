import type { PeriodQuery } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/auth/store';
import { studentKeys } from './keys';

/** `GET /parent/children`. */
export function useChildren(enabled = true) {
  return useQuery({
    queryKey: studentKeys.children(),
    queryFn: () => call(api.family.listChildren()),
    enabled,
  });
}

/** `POST /parent/children/link` — привязка по коду; обновляет список детей и me.parent.childrenCount. */
export function useLinkChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => call(api.family.linkChild({ body: { code } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentKeys.children() });
      const { me, updateMe } = useAuthStore.getState();
      if (me?.parent) {
        updateMe({ ...me, parent: { ...me.parent, childrenCount: me.parent.childrenCount + 1 } });
      }
    },
  });
}

/** `DELETE /parent/children/:studentId`. */
export function useUnlinkChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => call(api.family.unlinkChild({ params: { studentId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.parentRoot }),
  });
}

/** `GET /parent/children/:studentId/home`. */
export function useParentHome(studentId: string | null) {
  return useQuery({
    queryKey: studentKeys.parentHome(studentId ?? ''),
    queryFn: () => call(api.dashboards.getParentChildHome({ params: { studentId: studentId! } })),
    enabled: !!studentId,
  });
}

/** `GET /parent/children/:studentId/analytics?from&to`. */
export function useChildAnalytics(studentId: string | null, period: PeriodQuery) {
  return useQuery({
    queryKey: studentKeys.childAnalytics(studentId ?? '', period),
    queryFn: () =>
      call(
        api.dashboards.getParentChildAnalytics({
          params: { studentId: studentId! },
          query: period,
        }),
      ),
    enabled: !!studentId,
  });
}

/** `GET /teacher/students/:studentId`. */
export function useTeacherStudent(studentId: string) {
  return useQuery({
    queryKey: studentKeys.teacherStudent(studentId),
    queryFn: () => call(api.dashboards.getTeacherStudent({ params: { studentId } })),
  });
}
