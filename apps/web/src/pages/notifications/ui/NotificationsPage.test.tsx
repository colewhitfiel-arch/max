/**
 * `/notifications`: плюральный счётчик, тап по непрочитанному — отметка (+ переход по ссылке),
 * прочитанное без ссылки — не кнопка и без повторного запроса, «Показать ещё» по курсору.
 */
import type { NotificationDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NotificationEntity from '@/entities/notification';
import '@/shared/i18n';
import { NotificationsPage } from './NotificationsPage';

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
  query: null as unknown,
  markRead: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/entities/notification', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationEntity>()),
  useNotificationsInfinite: () => hooks.query,
  useMarkRead: () => hooks.markRead,
}));

function ready(items: NotificationDto[], unreadCount: number, more = false) {
  return {
    data: { pages: [{ items, unreadCount }], pageParams: [undefined] },
    error: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: more,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/student/assignments" element={<p>задания</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    hooks.markRead.mutate.mockReset();
  });

  it('счётчик в шапке склоняется: «1 непрочитанное»', () => {
    hooks.query = ready([note(1)], 1);
    renderPage();
    expect(screen.getByText('1 непрочитанное')).toBeInTheDocument();
  });

  it('тап по непрочитанному отмечает и ведёт по ссылке', async () => {
    const user = userEvent.setup();
    hooks.query = ready([note(1, { payload: { route: '/student/assignments' } })], 1);
    renderPage();

    await user.click(screen.getByText('Уведомление 1'));

    expect(hooks.markRead.mutate).toHaveBeenCalledWith([note(1).id], expect.anything());
    expect(screen.getByText('задания')).toBeInTheDocument();
  });

  it('прочитанное со ссылкой — только переход, без повторного POST', async () => {
    const user = userEvent.setup();
    hooks.query = ready([note(1, { readAt: 'x', payload: { route: '/student/assignments' } })], 0);
    renderPage();

    await user.click(screen.getByText('Уведомление 1'));

    expect(hooks.markRead.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('задания')).toBeInTheDocument();
  });

  it('прочитанное без ссылки — не кнопка', () => {
    hooks.query = ready([note(1, { readAt: 'x' })], 0);
    renderPage();
    expect(screen.queryByRole('button', { name: /Уведомление 1/ })).not.toBeInTheDocument();
  });

  it('у непрочитанного — текстовая «Прочитано»; есть ещё страницы — «Показать ещё»', async () => {
    const user = userEvent.setup();
    const query = ready([note(1)], 3, true);
    hooks.query = query;
    renderPage();

    const row = screen.getByRole('button', { name: /Уведомление 1/ });
    expect(within(row).getByRole('button', { name: 'Прочитано' })).toHaveTextContent('Прочитано');

    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
