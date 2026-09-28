/**
 * «Внешний вид» — только тема: выбора языка нет ни у одной роли (docs/00 §1.4). Тема применяется
 * сразу и откатывается, если сервер не сохранил настройку; при успехе остаётся выбранной.
 */
import { ToastProvider } from '@edu/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { useUiStore } from '@/shared/store/ui-store';
import { AppearanceSettings } from './AppearanceSettings';

type Callbacks = { onError?: (error: unknown) => void; onSuccess?: () => void };

const hooks = vi.hoisted(() => ({
  mutate: null as unknown as (vars: unknown, callbacks?: Callbacks) => void,
  /** Колбэки последнего запроса: тест сам решает, когда «ответит сервер». */
  pending: undefined as Callbacks | undefined,
}));

vi.mock('@/shared/auth/hooks', () => ({
  useAuth: () => ({
    me: {
      user: { id: 'u1', firstName: 'Анна', lastName: null, nickname: null, avatarUrl: null },
      settings: { theme: 'SYSTEM', locale: 'en' },
    },
  }),
}));
vi.mock('@/entities/session', () => ({
  useUpdateSettings: () => ({ mutate: hooks.mutate, isPending: false }),
}));

function renderSettings() {
  return render(
    <ToastProvider>
      <AppearanceSettings />
    </ToastProvider>,
  );
}

describe('AppearanceSettings', () => {
  beforeEach(() => {
    act(() => useUiStore.getState().setTheme('SYSTEM'));
    hooks.pending = undefined;
    hooks.mutate = vi.fn((_vars: unknown, callbacks?: Callbacks) => {
      hooks.pending = callbacks;
    });
  });

  it('только тема: строки и списка выбора языка нет', () => {
    renderSettings();

    expect(screen.getByRole('radiogroup', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.queryByText(/Язык/)).not.toBeInTheDocument();
    expect(screen.queryByText('English')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('ошибка сохранения — тема возвращается к прежней', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('radio', { name: 'Тёмная' }));

    expect(hooks.mutate).toHaveBeenCalledWith({ theme: 'DARK' }, expect.anything());
    expect(useUiStore.getState().theme).toBe('DARK');
    act(() => hooks.pending?.onError?.(new Error('boom')));
    expect(useUiStore.getState().theme).toBe('SYSTEM');
    expect(await screen.findByText('Не удалось сохранить настройки')).toBeInTheDocument();
  });

  it('успешное сохранение — тема остаётся выбранной', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('radio', { name: 'Тёмная' }));
    act(() => hooks.pending?.onSuccess?.());

    expect(useUiStore.getState().theme).toBe('DARK');
    expect(screen.getByRole('radio', { name: 'Тёмная' })).toHaveAttribute('aria-checked', 'true');
  });
});
