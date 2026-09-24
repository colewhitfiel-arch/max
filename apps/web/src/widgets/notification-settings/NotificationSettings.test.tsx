/**
 * Настройки уведомлений: обычная ошибка загрузки — с «Повторить»; 501 — строка «появятся позже».
 */
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NotificationEntity from '@/entities/notification';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { NotificationSettings } from './NotificationSettings';

const hooks = vi.hoisted(() => ({ query: null as unknown }));

vi.mock('@/entities/notification', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationEntity>()),
  useNotificationSettings: () => hooks.query,
  useUpdateNotificationSettings: () => ({ mutate: vi.fn(), isPending: false }),
}));

const failed = (error: unknown) => ({
  data: undefined,
  error,
  isPending: false,
  isError: true,
  refetch: vi.fn(),
});

function renderSettings() {
  return render(
    <ToastProvider>
      <NotificationSettings role="STUDENT" />
    </ToastProvider>,
  );
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    hooks.query = null;
  });

  it('ошибка загрузки — «Повторить» перезапрашивает настройки', async () => {
    const query = failed(new ApiClientError({ code: 'INTERNAL', message: 'x', status: 500 }));
    hooks.query = query;
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('ручки ещё нет (501) — короткая строка без повтора', () => {
    hooks.query = failed(
      new ApiClientError({ code: 'NOT_IMPLEMENTED', message: 'x', status: 501 }),
    );
    renderSettings();
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
  });
});
