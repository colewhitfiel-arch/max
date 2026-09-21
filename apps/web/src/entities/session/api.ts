import type { UpdateSettingsBody } from '@edu/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/auth/store';

/** `GET /me`; в store уже есть me после входа — запрос нужен для перепроверки/обновления. */
export function useMeQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => call(api.auth.getMe()),
    enabled,
  });
}

/** `PATCH /me/settings` — тема/язык; обновляет me в auth-store. */
export function useUpdateSettings() {
  const updateMe = useAuthStore((s) => s.updateMe);
  return useMutation({
    mutationFn: (body: UpdateSettingsBody) => call(api.auth.updateSettings({ body })),
    onSuccess: (me) => updateMe(me),
  });
}

/** `POST /student/link-code/rotate`. */
export function useRotateLinkCode() {
  const updateMe = useAuthStore((s) => s.updateMe);
  return useMutation({
    mutationFn: () => call(api.auth.rotateLinkCode()),
    onSuccess: ({ linkCode }) => {
      const me = useAuthStore.getState().me;
      if (me?.student) updateMe({ ...me, student: { ...me.student, linkCode } });
    },
  });
}
