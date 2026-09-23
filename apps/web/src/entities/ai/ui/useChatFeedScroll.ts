import type { AiMessageDto } from '@edu/contracts';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** Сколько пикселей до низа считать «пользователь у конца ленты» — тогда следим за стримом. */
const FOLLOW_THRESHOLD = 160;

/** Ближайший скроллируемый предок (скролл-область AppLayout). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export interface ChatFeedScrollOptions {
  /** Сообщения ленты по возрастанию времени (`useMessages().data.items`). */
  items: readonly AiMessageDto[] | undefined;
  /** Отправленный, но ещё не подтверждённый вопрос. */
  pendingText: string | null;
  /** Текст стримящегося ответа. */
  streamText: string;
}

/**
 * Прокрутка ленты чата с конца. `bottomRef` вешается на пустой элемент под лентой.
 * - Новое последнее сообщение (первое открытие, ответ пришёл) или отправленный вопрос — к низу.
 * - Во время стрима следим за текстом, только если пользователь и так у конца ленты.
 * - `loadOlder(fetch)` подгружает более старые сообщения и сохраняет позицию: лента не прыгает,
 *   старое встаёт выше того, что пользователь читал.
 */
export function useChatFeedScroll({ items, pendingText, streamText }: ChatFeedScrollOptions) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // Расстояние от текущей позиции до низа ленты перед подгрузкой старых сообщений.
  const olderRef = useRef<number | null>(null);
  const firstId = items?.[0]?.id;
  const lastId = items?.at(-1)?.id;

  const scrollToEnd = useCallback((force: boolean) => {
    const scroller = scrollParent(bottomRef.current);
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (force || distance < FOLLOW_THRESHOLD) scroller.scrollTo({ top: scroller.scrollHeight });
  }, []);

  // Старые сообщения встали сверху — возвращаем то же расстояние до низа (до отрисовки кадра).
  useLayoutEffect(() => {
    const fromBottom = olderRef.current;
    if (fromBottom === null) return;
    olderRef.current = null;
    const scroller = scrollParent(bottomRef.current);
    if (scroller) scroller.scrollTop = scroller.scrollHeight - fromBottom;
  }, [firstId]);

  useEffect(() => scrollToEnd(true), [lastId, pendingText, scrollToEnd]);
  useEffect(() => scrollToEnd(false), [streamText, scrollToEnd]);

  const loadOlder = useCallback(async (fetchOlder: () => Promise<unknown>) => {
    const scroller = scrollParent(bottomRef.current);
    olderRef.current = scroller ? scroller.scrollHeight - scroller.scrollTop : null;
    await fetchOlder();
  }, []);

  return { bottomRef, loadOlder };
}
