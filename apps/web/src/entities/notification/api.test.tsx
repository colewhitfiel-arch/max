/**
 * `useMarkRead`: оптимистично отмечает и плоский список, и постраничный; счётчик берёт
 * серверный (с учётом непрочитанных вне загруженной страницы); при ошибке — откат.
 */
import type { NotificationDto, NotificationsPage } from '@edu/contracts';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useMarkRead } from './api';
import { notificationKeys } from './keys';

const server = vi.hoisted(() => ({ markRead: vi.fn<(args: unknown) => Promise<unknown>>() }));

vi.mock('@/shared/api/client', () => ({
  api: { notifications: { markNotificationsRead: (args: unknown) => server.markRead(args) } },
  call: (promise: Promise<unknown>) => promise,
}));

const note = (n: number, readAt: string | null = null): NotificationDto => ({
  id: `0190a000-0000-7000-8000-00000000000${n}`,
  type: 'LESSON_SOON',
  title: `Уведомление ${n}`,
  body: null,
  payload: null,
  readAt,
  createdAt: '2026-09-22T09:00:00.000Z',
});

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  // unreadCount 5: на загруженной странице двое непрочитанных, ещё трое — дальше по курсору.
  const flat: NotificationsPage = { items: [note(1), note(2), note(3, 'x')], unreadCount: 5 };
  const infinite: InfiniteData<NotificationsPage> = {
    pages: [flat, { items: [note(4)], unreadCount: 5 }],
    pageParams: [undefined, 'c1'],
  };
  queryClient.setQueryData(notificationKeys.list({}), flat);
  queryClient.setQueryData(notificationKeys.infinite({}), infinite);
  queryClient.setQueryData(notificationKeys.settings(), { lessons: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMarkRead(), { wrapper });
  return { queryClient, result, flat, infinite };
}

describe('useMarkRead', () => {
  it('отметка одного: счётчик уменьшается от серверного, а не пересчитывается по странице', async () => {
    server.markRead.mockReturnValue(new Promise(() => {}));
    const { queryClient, result } = setup();

    act(() => result.current.mutate([note(1).id]));

    await waitFor(() => {
      const flat = queryClient.getQueryData<NotificationsPage>(notificationKeys.list({}));
      expect(flat?.unreadCount).toBe(4);
      expect(flat?.items[0]?.readAt).not.toBeNull();
    });
    const infinite = queryClient.getQueryData<InfiniteData<NotificationsPage>>(
      notificationKeys.infinite({}),
    );
    expect(infinite?.pages.map((p) => p.unreadCount)).toEqual([4, 4]);
    expect(infinite?.pages[0]?.items[0]?.readAt).not.toBeNull();
    expect(infinite?.pages[1]?.items[0]?.readAt).toBeNull();
    // Настройки под тем же префиксом не трогаются.
    expect(queryClient.getQueryData(notificationKeys.settings())).toEqual({ lessons: true });
  });

  it('«прочитать все» обнуляет счётчик во всех страницах', async () => {
    server.markRead.mockReturnValue(new Promise(() => {}));
    const { queryClient, result } = setup();

    act(() => result.current.mutate(undefined));

    await waitFor(() => {
      const infinite = queryClient.getQueryData<InfiniteData<NotificationsPage>>(
        notificationKeys.infinite({}),
      );
      expect(infinite?.pages.every((p) => p.unreadCount === 0)).toBe(true);
      expect(infinite?.pages.flatMap((p) => p.items).every((n) => n.readAt)).toBe(true);
    });
  });

  it('ошибка сервера — оптимистичная отметка откатывается', async () => {
    server.markRead.mockRejectedValue(new Error('500'));
    const { queryClient, result, flat, infinite } = setup();
    // Без refetch после onSettled: проверяем именно откат кэша.
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    act(() => result.current.mutate([note(1).id]));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(notificationKeys.list({}))).toEqual(flat);
    expect(queryClient.getQueryData(notificationKeys.infinite({}))).toEqual(infinite);
  });
});
