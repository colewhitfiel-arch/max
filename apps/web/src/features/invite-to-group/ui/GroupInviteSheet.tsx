import {
  Button,
  CopyIcon,
  Field,
  Input,
  RefreshIcon,
  SendIcon,
  Sheet,
  Skeleton,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useGroupInvite, useResetGroupInvite } from '@/entities/group';
import { describeApiError } from '@/shared/api/errors';
import { canShare, isShareAbort } from '@/shared/lib/share';
import { useMaxBridge } from '@/shared/max';
import { QueryError } from '@/shared/ui';

export interface GroupInviteSheetProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  /** Название группы — для текста «Поделиться». */
  groupTitle: string;
}

/**
 * «Пригласить учеников» (docs/07 F19): многоразовая ссылка группы — «Поделиться» в MAX или
 * копирование; «Сбросить ссылку» выдаёт новую, по старой вступить уже нельзя.
 */
export function GroupInviteSheet({ open, onClose, groupId, groupTitle }: GroupInviteSheetProps) {
  const { t } = useTranslation('teacher');
  const toast = useToast();
  const bridge = useMaxBridge();
  const invite = useGroupInvite(groupId, open);
  const reset = useResetGroupInvite(groupId);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      bridge.haptic('success');
      toast.show({ tone: 'success', title: t('invite.copied') });
    } catch {
      toast.show({ tone: 'warning', title: t('invite.copyFailed') });
    }
  };

  const share = async (url: string) => {
    if (!canShare()) return copy(url);
    try {
      await navigator.share({
        title: t('invite.shareTitle'),
        text: t('invite.shareText', { group: groupTitle }),
        url,
      });
    } catch (cause) {
      if (!isShareAbort(cause)) await copy(url);
    }
  };

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.show({ tone: 'success', title: t('invite.resetDone') });
    } catch (cause) {
      toast.show({
        tone: 'danger',
        title: t('invite.resetError'),
        description: describeApiError(cause),
      });
    }
  };

  let content;
  if (invite.isPending) {
    content = (
      <Stack gap={3} aria-busy="true">
        <Skeleton height={48} />
        <Skeleton height={48} />
      </Stack>
    );
  } else if (invite.isError) {
    content = <QueryError error={invite.error} onRetry={() => void invite.refetch()} />;
  } else {
    const { url } = invite.data;
    content = (
      <Stack gap={3}>
        <Field label={t('invite.link')}>
          <Input
            value={url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {canShare() ? (
          <Button leftIcon={<SendIcon />} onClick={() => void share(url)} fullWidth>
            {t('invite.share')}
          </Button>
        ) : (
          <Button leftIcon={<CopyIcon />} onClick={() => void copy(url)} fullWidth>
            {t('invite.copy')}
          </Button>
        )}
        <Button
          variant="ghost"
          leftIcon={<RefreshIcon />}
          loading={reset.isPending}
          onClick={() => void onReset()}
          fullWidth
        >
          {t('invite.reset')}
        </Button>
        <Text variant="caption" tone="muted">
          {t('invite.resetHint')}
        </Text>
      </Stack>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('invite.title')}
      closeLabel={t('common:actions.close')}
    >
      <Stack gap={4}>
        <Text variant="small" tone="muted">
          {t('invite.description')}
        </Text>
        {content}
      </Stack>
    </Sheet>
  );
}
