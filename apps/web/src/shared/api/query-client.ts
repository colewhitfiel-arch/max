import { QueryClient } from '@tanstack/react-query';
import { isApiClientError } from './errors';

/**
 * 4xx и NOT_IMPLEMENTED (501, «раздел в разработке») не ретраим — это не «моргнула сеть»,
 * а ответ сервера: повтор только задержал бы экран ошибки.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiClientError(error)) {
    if (error.status >= 400 && error.status < 500) return false;
    if (error.code === 'NOT_IMPLEMENTED') return false;
  }
  return failureCount < 2;
}

/** Единый QueryClient приложения (используется и в провайдере, и в auth-store для сброса кеша). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      // В WebView возврат в приложение = focus окна, данные стоит освежить.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
