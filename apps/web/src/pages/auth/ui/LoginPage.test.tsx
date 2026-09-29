/**
 * `/auth` в max-режиме: после выхода (anonymous без ошибки) автовход запускается сам и ровно
 * один раз — экран не висит на спиннере; при ошибке — «Повторить».
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoTourStore } from '@/features/demo-tour';
import { ApiClientError } from '@/shared/api/errors';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import type * as ConfigModule from '@/shared/config';
import '@/shared/i18n';
import { LoginPage } from './LoginPage';

vi.mock('@/shared/config', async (importOriginal) => {
  const original = await importOriginal<typeof ConfigModule>();
  return { ...original, config: { ...original.config, authMode: 'max', isDev: false } };
});
vi.mock('@/shared/max', () => ({ useMaxBridge: () => ({ getLaunchParams: () => 'launch' }) }));

const loginMax = vi.fn<(launchParams: string | null) => Promise<never>>();

function renderLogin() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<LoginPage />} />
          <Route path="/" element={<p>корень</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('LoginPage (max)', () => {
  beforeEach(() => {
    loginMax.mockReset();
    // Сымитировать провал входа: store выставляет ошибку, как настоящий loginMax.
    loginMax.mockImplementation(() => {
      const error = new ApiClientError({ code: 'UNAUTHORIZED', message: 'нет', status: 401 });
      useAuthStore.setState({ status: 'anonymous', error });
      return Promise.reject(error);
    });
    useAuthStore.setState({ status: 'anonymous', error: null, me: null, loginMax });
  });

  afterEach(() => {
    resetAuthStore();
    useDemoTourStore.getState().stop();
  });

  it('после выхода вход через MAX запускается сам и один раз (StrictMode)', async () => {
    renderLogin();
    await waitFor(() => expect(loginMax).toHaveBeenCalledTimes(1));
    expect(loginMax).toHaveBeenCalledWith('launch');
    expect(await screen.findByText('Не удалось войти через MAX')).toBeInTheDocument();
    expect(loginMax).toHaveBeenCalledTimes(1);
  });

  it('«Повторить» после ошибки снова вызывает вход', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: 'Повторить' }));
    expect(loginMax).toHaveBeenCalledTimes(2);
  });

  it('пока идёт вход через MAX — без демонстрационного режима, после ошибки — кнопка запускает тур', async () => {
    const user = userEvent.setup();
    loginMax.mockImplementation(() => new Promise<never>(() => {}));
    const { unmount } = renderLogin();
    await waitFor(() => expect(loginMax).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Демонстрационный режим' })).toBeNull();
    unmount();

    loginMax.mockImplementation(() => {
      const error = new ApiClientError({ code: 'UNAUTHORIZED', message: 'нет', status: 401 });
      useAuthStore.setState({ status: 'anonymous', error });
      return Promise.reject(error);
    });
    renderLogin();
    await user.click(await screen.findByRole('button', { name: 'Демонстрационный режим' }));
    expect(useDemoTourStore.getState()).toMatchObject({ active: true, index: 0 });
  });
});
