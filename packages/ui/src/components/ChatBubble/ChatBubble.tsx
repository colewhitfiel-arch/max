import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { TypingIndicator } from './TypingIndicator';
import './ChatBubble.css';

export type ChatBubbleSide = 'start' | 'end';

export interface ChatBubbleProps extends HTMLAttributes<HTMLDivElement> {
  /** `start` — собеседник (слева, поверхность), `end` — пользователь (справа, primary). */
  side?: ChatBubbleSide;
  /** Аватар собеседника у нижнего края пузыря (обычно только для `start`). */
  avatar?: ReactNode;
  /** Подпись под пузырём (время, статус). */
  meta?: ReactNode;
  /**
   * Ответ ещё приходит: `aria-busy`, мигающий курсор после текста;
   * пока текста нет — индикатор набора вместо содержимого.
   */
  streaming?: boolean;
  /** Доступное название индикатора набора. */
  typingLabel?: string;
  /**
   * Плавное появление при монтировании (подъём + проявление, ~250мс; без анимации при
   * `prefers-reduced-motion`). Для новых сообщений ленты, а не для истории.
   */
  appear?: boolean;
  /** Текст сообщения (переносы строк сохраняются). */
  children?: ReactNode;
}

/** Пузырь сообщения чата. Домена не знает: роль и время форматирует потребитель. */
export const ChatBubble = forwardRef<HTMLDivElement, ChatBubbleProps>(function ChatBubble(
  {
    side = 'start',
    avatar,
    meta,
    streaming = false,
    typingLabel,
    appear = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const empty = children == null || children === '';
  return (
    <div
      ref={ref}
      className={cx('ui-chat-bubble', className)}
      data-side={side}
      data-streaming={streaming || undefined}
      data-appear={appear || undefined}
      aria-busy={streaming || undefined}
      {...rest}
    >
      {avatar != null && <div className="ui-chat-bubble__avatar">{avatar}</div>}
      <div className="ui-chat-bubble__body">
        <div className="ui-chat-bubble__content">
          {streaming && empty ? <TypingIndicator label={typingLabel} /> : children}
        </div>
        {meta != null && <div className="ui-chat-bubble__meta">{meta}</div>}
      </div>
    </div>
  );
});
