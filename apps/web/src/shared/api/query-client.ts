import { QueryClient } from '@tanstack/react-query';
import { isApiClientError } from './errors';

/** 4xx не ретраим — это не «моргнула сеть», а ответ сервера. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiClientError(error) && error.status >= 400 && error.status < 500) return false;
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
