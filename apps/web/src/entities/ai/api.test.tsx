/**
 * `useTrajectory`: траектории ещё нет — api отвечает 200 с пустым телом (Nest не пишет JSON
 * `null`), клиент получает `undefined`. Хук отдаёт `null` (пустое состояние), а не ошибку.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as ApiClient from '@/shared/api/client';
import { useTrajectory } from './api';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  api: { ai: { getTrajectory: () => Promise.resolve(undefined) } },
  call: (promise: Promise<unknown>) => promise,
}));

describe('useTrajectory', () => {
  it('пустое тело ответа — траектории нет (null), а не ошибка', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTrajectory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
