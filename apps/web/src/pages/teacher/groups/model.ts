import { useEffect, useState } from 'react';

/** Значение с задержкой: поиск учеников не дёргает сервер на каждую букву. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Группа только что создана: её экран сразу открывает «Пригласить учеников». */
export const OPEN_INVITE_STATE = { openInvite: true } as const;

export function shouldOpenInvite(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'openInvite' in state;
}
