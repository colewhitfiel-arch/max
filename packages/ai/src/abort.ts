/**
 * Утилиты для работы с `AbortSignal`: причина отмены, ожидание с отменой,
 * связывание сигналов. Используются retry/timeout и провайдерами.
 */

/** Причина отмены сигнала; если не задана — стандартный `AbortError`. */
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Запрос отменён', 'AbortError');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

/** `setTimeout` в виде промиса; отклоняется причиной отмены, если сигнал сработал раньше. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Пробрасывает отмену внешнего сигнала в контроллер (с той же причиной).
 * Возвращает функцию для снятия подписки.
 */
export function linkAbortSignal(controller: AbortController, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(abortReason(signal));
    return () => {};
  }
  const onAbort = () => controller.abort(abortReason(signal));
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}
