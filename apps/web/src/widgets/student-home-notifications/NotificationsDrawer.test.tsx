/**
 * Панель уведомлений: тап по прочитанному не шлёт markRead (прочитанное без ссылки — вообще не
 * кнопка), по непрочитанному — отмечает; ошибка отметки — тост; у строки — компактная галочка.
 */
import type { NotificationDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NotificationEntity from '@/entities/notification';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { NotificationsDrawer } from './NotificationsDrawer';

const note = (n: number, patch: Partial<NotificationDto> = {}): NotificationDto => ({
  id: `0190a000-0000-7000-8000-00000000000${n}`,
  type: 'LESSON_SOON',
  title: `Уведомление ${n}`,
  body: null,
  payload: null,
  readAt: null,
  createdAt: '2026-09-22T09:00:00.000Z',
  ...patch,
});

const hooks = vi.hoisted(() => ({
  items: [] as NotificationDto[],
  mutate: vi.fn(),
}));

vi.mock('@/entities/notification', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationEntity>()),
  useNotifications: () => ({
    data: { items: hooks.items, unreadCount: hooks.items.filter((n) => !n.readAt).length },
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useMarkRead: () => ({ mutate: hooks.mutate, isPending: false }),
}));

function renderDrawer() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <NotificationsDrawer open onClose={() => undefined} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('NotificationsDrawer', () => {
  beforeEach(() => {
    hooks.mutate.mockReset();
  });

  it('прочитанное без ссылки — не кнопка и без markRead', () => {
    hooks.items = [note(1, { readAt: '2026-09-22T10:00:00.000Z' })];
    renderDrawer();
    expect(screen.queryByRole('button', { name: /Уведомление 1/ })).toBeNull();
    expect(hooks.mutate).not.toHaveBeenCalled();
  });

  it('прочитанное со ссылкой — переход без повторной отметки', async () => {
    const user = userEvent.setup();
    hooks.items = [
      note(1, { readAt: '2026-09-22T10:00:00.000Z', payload: { route: '/student/courses' } }),
    ];
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Уведомление 1/ }));
    expect(hooks.mutate).not.toHaveBeenCalled();
  });

  it('непрочитанное: тап отмечает, ошибка — тост; у строки — компактная галочка', async () => {
    const user = userEvent.setup();
    hooks.items = [note(1)];
    hooks.mutate.mockImplementation(
      (_ids: string[], options?: { onError?: (e: unknown) => void }) =>
        options?.onError?.(new ApiClientError({ code: 'INTERNAL', message: 'x', status: 500 })),
    );
    renderDrawer();

    // Компактная кнопка: иконка с подписью, без текста «Прочитано» в строке.
    const check = screen.getByRole('button', { name: 'Прочитано' });
    expect(check).not.toHaveTextContent('Прочитано');

    await user.click(screen.getByRole('button', { name: /Уведомление 1/ }));
    expect(hooks.mutate).toHaveBeenCalledWith([note(1).id], expect.any(Object));
    expect(
      await screen.findByText('Что-то пошло не так, стоит попробовать ещё раз'),
    ).toBeInTheDocument();
  });
});
