import { FILE_SIZE_LIMITS } from '@edu/contracts';
import { Button, Inline, useToast } from '@edu/ui';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadFile } from '@/entities/file';
import { useUpdateAvatar } from '@/entities/session';
import { describeApiError } from '@/shared/api/errors';
import { useMaxBridge } from '@/shared/max';

/** Лимит размера фото профиля (docs/05 `files.ts`), в МБ — для подсказки. */
const MAX_AVATAR_MB = FILE_SIZE_LIMITS.AVATAR / 1024 / 1024;

export interface ChangeAvatarProps {
  /** Есть ли сейчас фото — тогда рядом кнопка «Убрать фото». */
  hasPhoto: boolean;
}

/**
 * Смена фото профиля: выбор картинки → загрузка через files flow (purpose AVATAR:
 * upload-url → PUT → confirm) → `PUT /me/avatar`. «Убрать фото» — `fileId: null`.
 */
export function ChangeAvatar({ hasPhoto }: ChangeAvatarProps) {
  const { t } = useTranslation('parent-profile');
  const toast = useToast();
  const bridge = useMaxBridge();
  const inputRef = useRef<HTMLInputElement>(null);
  const updateAvatar = useUpdateAvatar();
  const change = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile({ file, purpose: 'AVATAR' });
      return updateAvatar.mutateAsync({ fileId: uploaded.id });
    },
  });
  const busy = change.isPending || updateAvatar.isPending;

  const onPick = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.show({ tone: 'warning', title: t('avatar.notImage') });
      return;
    }
    if (file.size > FILE_SIZE_LIMITS.AVATAR) {
      toast.show({ tone: 'warning', title: t('avatar.tooBig', { mb: MAX_AVATAR_MB }) });
      return;
    }
    change.mutate(file, {
      onSuccess: () => {
        bridge.haptic('success');
        toast.show({ tone: 'success', title: t('avatar.changed') });
      },
      onError: (error) =>
        toast.show({
          tone: 'danger',
          title: t('avatar.error'),
          description: describeApiError(error),
        }),
    });
  };

  const onRemove = () =>
    updateAvatar.mutate(
      { fileId: null },
      {
        onSuccess: () => toast.show({ tone: 'success', title: t('avatar.removed') }),
        onError: (error) =>
          toast.show({
            tone: 'danger',
            title: t('avatar.error'),
            description: describeApiError(error),
          }),
      },
    );

  return (
    <Inline gap={3} justify="center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={t('avatar.pick')}
        onChange={(event) => onPick(event.target.files?.[0])}
      />
      <Button
        variant="secondary"
        size="sm"
        loading={change.isPending}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {t('avatar.change')}
      </Button>
      {hasPhoto && (
        <Button variant="link" size="sm" disabled={busy} onClick={onRemove}>
          {t('avatar.remove')}
        </Button>
      )}
    </Inline>
  );
}
