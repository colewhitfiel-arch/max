/**
 * «Внешний вид»: язык, как и тема, применяется сразу и откатывается, если сервер не сохранил
 * настройку; при успехе остаётся выбранным.
 */
import { ToastProvider } from '@edu/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setLanguage } from '@/shared/i18n';
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
      settings: { theme: 'SYSTEM', locale: 'ru' },
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

describe('AppearanceSettings: язык', () => {
  beforeEach(async () => {
    await setLanguage('ru');
    hooks.pending = undefined;
    hooks.mutate = vi.fn((_vars: unknown, callbacks?: Callbacks) => {
      hooks.pending = callbacks;
    });
  });

  afterEach(async () => {
    await setLanguage('ru');
  });

  it('ошибка сохранения — язык возвращается к прежнему', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /Язык/ }));
    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(hooks.mutate).toHaveBeenCalledWith({ locale: 'en' }, expect.anything());
    await vi.waitFor(() => expect(i18n.language).toBe('en'));
    act(() => hooks.pending?.onError?.(new Error('boom')));
    await vi.waitFor(() => expect(i18n.language).toBe('ru'));
  });

  it('успешное сохранение — язык остаётся выбранным', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /Язык/ }));
    await user.click(screen.getByRole('button', { name: 'English' }));

    act(() => hooks.pending?.onSuccess?.());
    await vi.waitFor(() => expect(i18n.language).toBe('en'));
  });
});
