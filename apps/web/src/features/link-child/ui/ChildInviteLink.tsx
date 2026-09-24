import {
  Button,
  CopyIcon,
  ErrorState,
  Field,
  Input,
  LinkIcon,
  SendIcon,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useCreateChildInvite } from '@/entities/student';
import { describeApiError } from '@/shared/api/errors';
import { formatDate } from '@/shared/lib/dates';
import { useMaxBridge } from '@/shared/max';

/** Системное «Поделиться» (в MAX/мобильном WebView); на десктопе его обычно нет — копируем. */
function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Пользователь закрыл системное окно «Поделиться» — это не ошибка. */
function isShareAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

/**
 * Приглашение ребёнка по ссылке (docs/07 F14): `POST /parent/children/invites` → ссылка,
 * которую родитель отправляет ребёнку в MAX («Поделиться» или копирование). Ребёнок
 * открывает её, подтверждает — и появляется в списке детей.
 */
export function ChildInviteLink() {
  const { t, i18n } = useTranslation('parent');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const bridge = useMaxBridge();
  const create = useCreateChildInvite();
  const invite = create.data;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      bridge.haptic('success');
      toast.show({ tone: 'success', title: t('addChild.invite.copied') });
    } catch {
      toast.show({ tone: 'warning', title: t('addChild.invite.copyFailed') });
    }
  };

  const share = async (url: string) => {
    if (!canShare()) return copy(url);
    try {
      await navigator.share({
        title: t('addChild.invite.shareTitle'),
        text: t('addChild.invite.shareText'),
        url,
      });
    } catch (cause) {
      if (!isShareAbort(cause)) await copy(url);
    }
  };

  if (!invite) {
    return (
      <Stack gap={3}>
        {create.isError ? (
          <ErrorState
            title={tc('states.error')}
            description={describeApiError(create.error)}
            onRetry={() => create.mutate()}
            retryLabel={tc('actions.retry')}
          />
        ) : (
          <Button
            leftIcon={<LinkIcon />}
            loading={create.isPending}
            onClick={() => create.mutate()}
            fullWidth
          >
            {t('addChild.invite.create')}
          </Button>
        )}
        <Text variant="caption" tone="muted">
          {t('addChild.invite.hint')}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={3}>
      <Field
        label={t('addChild.invite.link')}
        hint={t('addChild.invite.expires', { date: formatDate(invite.expiresAt, i18n.language) })}
      >
        <Input
          value={invite.url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {canShare() ? (
        <Button leftIcon={<SendIcon />} onClick={() => void share(invite.url)} fullWidth>
          {t('addChild.invite.share')}
        </Button>
      ) : (
        <Button leftIcon={<CopyIcon />} onClick={() => void copy(invite.url)} fullWidth>
          {t('addChild.invite.copy')}
        </Button>
      )}
      <Text variant="caption" tone="muted">
        {t('addChild.invite.hint')}
      </Text>
    </Stack>
  );
}
