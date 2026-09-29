/**
 * Системное «Поделиться» (в MAX и мобильном WebView). На десктопе его обычно нет — там ссылку
 * копируют.
 */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Пользователь закрыл системное окно «Поделиться» — это не ошибка. */
export function isShareAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}
