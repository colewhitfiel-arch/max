import type { AiMessageDto } from '@edu/contracts';
import { Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatRelativeDay, isSameDay } from '@/shared/lib/dates';
import { ChatMessage } from './ChatMessage';

/** Разделитель дня между сообщениями («Сегодня», «Вчера», «21 сент.»). */
export function ChatDayDivider({ date }: { date: string }) {
  const { i18n } = useTranslation();
  const label = formatRelativeDay(date, i18n.language);
  return (
    <Text variant="caption" tone="muted" align="center" role="separator" aria-label={label}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Text>
  );
}

export interface ChatMessageListProps {
  items: AiMessageDto[];
  /** Доступное имя своих пузырей, см. `ChatMessage.ownLabel`. */
  ownLabel?: string;
}

/** Лента сообщений диалога с ИИ: пузыри по ролям и разделители дней. */
export function ChatMessageList({ items, ownLabel }: ChatMessageListProps) {
  return (
    <>
      {items.map((message, index) => {
        const previous = items[index - 1];
        const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
        return (
          <Stack key={message.id} gap={3}>
            {newDay && <ChatDayDivider date={message.createdAt} />}
            <ChatMessage
              role={message.role}
              content={message.content}
              createdAt={message.createdAt}
              ownLabel={ownLabel}
            />
          </Stack>
        );
      })}
    </>
  );
}
