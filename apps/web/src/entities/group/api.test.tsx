/**
 * `useUpdateGroup`: успех переименования сообщается сразу, не дожидаясь перезапроса данных
 * преподавателя, — иначе форма, перемонтированная новым названием, теряет тост «Название сохранено».
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as ApiClient from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useUpdateGroup } from './api';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  api: { groups: { updateGroup: () => Promise.resolve({ id: 'g1', title: 'Новое' }) } },
  call: (promise: Promise<unknown>) => promise,
}));

describe('useUpdateGroup', () => {
  it('onSuccess вызова срабатывает, пока данные преподавателя ещё перезапрашиваются', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    let fetches = 0;
    // Активный запрос данных преподавателя: первый ответ сразу, перезапрос висит.
    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: [...queryKeys.teacher, 'groups'],
          queryFn: () => (fetches++ === 0 ? Promise.resolve([]) : new Promise<never>(() => {})),
        });
        return useUpdateGroup('g1');
      },
      { wrapper },
    );
    await waitFor(() => expect(fetches).toBe(1));

    const onSuccess = vi.fn();
    act(() => result.current.mutate({ title: 'Новое' }, { onSuccess }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetches).toBe(2);
  });
});
