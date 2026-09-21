import type { MessageRole } from '@edu/contracts';
import { Card, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/shared/lib/dates';

export interface ChatMessageProps {
  role: MessageRole;
  content: string;
  createdAt?: string;
  /** Ответ ещё стримится. */
  streaming?: boolean;
}

const ROLE_LABEL: Record<MessageRole, string> = {
  USER: 'Ты',
  ASSISTANT: 'Тьютор',
  SYSTEM: 'Система',
};

/** Сообщение чата на Card/Text — без собственных стилей (визуал заменит @edu/ui позже). */
export function ChatMessage({ role, content, createdAt, streaming }: ChatMessageProps) {
  const { i18n } = useTranslation();
  return (
    <Card padding="sm" data-role={role.toLowerCase()} aria-busy={streaming || undefined}>
      <Stack gap={1}>
        <Text variant="caption" tone={role === 'USER' ? 'primary' : 'muted'} weight="medium">
          {ROLE_LABEL[role]}
          {createdAt ? ` · ${formatTime(createdAt, i18n.language)}` : ''}
        </Text>
        <Text style={{ whiteSpace: 'pre-wrap' }}>{content || (streaming ? '…' : '')}</Text>
      </Stack>
    </Card>
  );
}
