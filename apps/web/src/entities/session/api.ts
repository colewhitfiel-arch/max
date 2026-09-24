import type { UpdateAvatarBody, UpdateSettingsBody } from '@edu/contracts';
import { useMutation } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { useAuthStore } from '@/shared/auth/store';

/** `PATCH /me/settings` — тема/язык; обновляет me в auth-store. */
export function useUpdateSettings() {
  const updateMe = useAuthStore((s) => s.updateMe);
  return useMutation({
    mutationFn: (body: UpdateSettingsBody) => call(api.auth.updateSettings({ body })),
    onSuccess: (me) => updateMe(me),
  });
}

/** `PUT /me/avatar` — фото профиля (файл purpose AVATAR) или `fileId: null`, чтобы убрать; обновляет me. */
export function useUpdateAvatar() {
  const updateMe = useAuthStore((s) => s.updateMe);
  return useMutation({
    mutationFn: (body: UpdateAvatarBody) => call(api.auth.updateAvatar({ body })),
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
