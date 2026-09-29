/**
 * Необработанные ошибки клиента: отправка на сервер (`POST /api/v1/client-errors` → warn в логах
 * стенда) и экран вместо пустоты. В WebView MAX нет консоли — иначе «чёрный экран» после сбоя
 * не диагностировать. Устаревший чанк после деплоя (`vite:preloadError`) — перезагрузка один раз.
 */
export interface ClientErrorReport {
  kind: 'error' | 'unhandledrejection' | 'render' | 'preload';
  message: string;
  stack?: string;
  url: string;
  at: string;
}

export interface ClientErrorOptions {
  /** База API (`config.apiUrl`), без завершающего слэша. */
  apiUrl: string;
  /** Показать экран сбоя, если приложение осталось пустым. */
  onFatal?: (error: unknown) => void;
  /** Что считать «приложение пустое» (по умолчанию — `#root` без детей). */
  isBlank?: () => boolean;
}

const RELOAD_FLAG = 'edu:preload-reloaded';
const DEDUPE_MS = 10_000;
const MAX_TEXT = 2_000;
let lastReport = { key: '', at: 0 };

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message.slice(0, MAX_TEXT), stack: error.stack?.slice(0, MAX_TEXT) };
  }
  if (typeof error === 'string') return { message: error.slice(0, MAX_TEXT) };
  try {
    return { message: JSON.stringify(error).slice(0, MAX_TEXT) };
  } catch {
    return { message: String(error).slice(0, MAX_TEXT) };
  }
}

/** Отправить отчёт; повтор той же ошибки в течение DEDUPE_MS не шлём. Никогда не бросает. */
export function reportClientError(
  apiUrl: string,
  kind: ClientErrorReport['kind'],
  error: unknown,
): void {
  const { message, stack } = describe(error);
  const key = `${kind}:${message}`;
  const now = Date.now();
  if (lastReport.key === key && now - lastReport.at < DEDUPE_MS) return;
  lastReport = { key, at: now };
  const body: ClientErrorReport = {
    kind,
    message,
    ...(stack ? { stack } : {}),
    url: typeof location === 'undefined' ? '' : location.href,
    at: new Date(now).toISOString(),
  };
  try {
    void fetch(`${apiUrl}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* fetch недоступен — молчим */
  }
}

function isPreloadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i.test(
    message,
  );
}

/** Один раз за сессию: чанк не загрузился (старая страница после деплоя) → перезагрузка. */
function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* sessionStorage недоступен — перезагрузим всё равно, но без защиты от цикла */
  }
  window.location.reload();
  return true;
}

export function installClientErrorReporting(options: ClientErrorOptions): () => void {
  const isBlank = options.isBlank ?? (() => !document.getElementById('root')?.childElementCount);
  const handle = (kind: ClientErrorReport['kind'], error: unknown) => {
    if (isPreloadError(error) && reloadOnce()) return;
    reportClientError(options.apiUrl, kind, error);
    // Дать React отработать свои границы; если после этого пусто — показать экран сбоя
    setTimeout(() => {
      if (isBlank()) options.onFatal?.(error);
    }, 0);
  };
  const onError = (event: ErrorEvent) => handle('error', event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => handle('unhandledrejection', event.reason);
  const onPreload = (event: Event) => {
    event.preventDefault();
    handle('preload', (event as Event & { payload?: unknown }).payload ?? 'vite:preloadError');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('vite:preloadError', onPreload);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('vite:preloadError', onPreload);
  };
}

/** Для тестов. */
export function resetClientErrorReportingForTests(): void {
  lastReport = { key: '', at: 0 };
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}
