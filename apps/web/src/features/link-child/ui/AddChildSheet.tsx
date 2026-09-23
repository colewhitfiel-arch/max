import { Divider, Inline, Sheet, Stack, Text } from '@edu/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChildInviteLink } from './ChildInviteLink';
import { LinkChildForm } from './LinkChildForm';

export interface AddChildSheetProps {
  open: boolean;
  onClose: () => void;
  /** Ребёнок привязан по коду (связь сразу ACTIVE) — обычно его выбирают. Шторка закрывается сама. */
  onLinked?: (studentId: string) => void;
}

/**
 * «Добавить ребёнка» (главная, выбор ребёнка в аналитике, список детей): два способа —
 * ссылка-приглашение, которую ребёнок подтверждает в MAX (F14), или код из его профиля (F9).
 */
export function AddChildSheet({ open, onClose, onLinked }: AddChildSheetProps) {
  const { t } = useTranslation('parent');
  const inviteId = useId();
  const codeId = useId();

  return (
    <Sheet open={open} onClose={onClose} title={t('addChild.title')}>
      <Stack gap={5}>
        <Stack gap={3} as="section" aria-labelledby={inviteId}>
          <Stack gap={1}>
            <Text id={inviteId} as="h3" weight="bold">
              {t('addChild.invite.title')}
            </Text>
            <Text variant="small" tone="muted">
              {t('addChild.invite.description')}
            </Text>
          </Stack>
          <ChildInviteLink />
        </Stack>

        <Inline gap={3} align="center" wrap={false} aria-hidden="true">
          <Stack grow>
            <Divider />
          </Stack>
          <Text variant="caption" tone="muted" as="span">
            {t('addChild.or')}
          </Text>
          <Stack grow>
            <Divider />
          </Stack>
        </Inline>

        <Stack gap={3} as="section" aria-labelledby={codeId}>
          <Stack gap={1}>
            <Text id={codeId} as="h3" weight="bold">
              {t('addChild.code.title')}
            </Text>
            <Text variant="small" tone="muted">
              {t('addChild.code.description')}
            </Text>
          </Stack>
          <LinkChildForm
            onLinked={(studentId) => {
              onLinked?.(studentId);
              onClose();
            }}
          />
        </Stack>
      </Stack>
    </Sheet>
  );
}
