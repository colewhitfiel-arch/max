import type { MessageRole } from '@edu/contracts';
import { AiIcon, ChatBubble, IconTile } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/shared/lib/dates';

export interface ChatMessageProps {
  role: MessageRole;
  content: string;
  createdAt?: string;
  /** Ответ ещё стримится. */
  streaming?: boolean;
}

/** Аватар тьютора у пузыря: робот на синей подложке (как пункт нижнего меню). */
export function TutorAvatar({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <IconTile tone="info" size={size}>
      <AiIcon />
    </IconTile>
  );
}

/** Сообщение чата: роль → сторона пузыря, у тьютора — аватар, под пузырём — время. */
export function ChatMessage({ role, content, createdAt, streaming }: ChatMessageProps) {
  const { t, i18n } = useTranslation('student');
  const own = role === 'USER';
  return (
    <ChatBubble
      side={own ? 'end' : 'start'}
      avatar={own ? undefined : <TutorAvatar />}
      meta={createdAt ? formatTime(createdAt, i18n.language) : undefined}
      streaming={streaming}
      typingLabel={t('tutor.thinking')}
      aria-label={own ? t('tutor.you') : t('tutor.assistant')}
      data-role={role.toLowerCase()}
    >
      {content}
    </ChatBubble>
  );
}
