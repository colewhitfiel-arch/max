/** Настройки родителя: секции как у ученика + «Семья и оплата» с разделами вне нижнего меню. */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from '@/test/fake-api/handlers';
import { apiError, apiUrl } from '@/test/fake-api/lib';
import { resetMockDb } from '@/test/fake-api/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { ParentSettingsPage } from './ParentSettingsPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

describe('ParentSettingsPage', () => {
  it('профиль, «Семья и оплата», внешний вид и выход; строки ведут в разделы', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/parent/settings', element: <ParentSettingsPage /> },
        { path: '/parent/*', element: <p>Раздел</p> },
      ],
      { initialEntries: ['/parent/settings'] },
    );
    render(
      <MaxBridgeProvider bridge={new MockMaxBridge({ launchParams: null })}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <I18nextProvider i18n={i18n}>
              <RouterProvider router={router} />
            </I18nextProvider>
          </ToastProvider>
        </QueryClientProvider>
      </MaxBridgeProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
    expect(screen.getByText('Семья и оплата')).toBeVisible();
    expect(screen.getByText('Внешний вид')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Выйти из аккаунта' }, WAIT)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Кошелёк/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/wallet'));
  });
});

describe('ParentSettingsPage: язык', () => {
  afterEach(() => {
    server.resetHandlers();
    void i18n.changeLanguage('ru');
  });

  it('ошибка сохранения языка — язык откатывается, как и тема', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    server.use(
      http.patch(apiUrl('/me/settings'), () => apiError('INTERNAL', 'Сбой сохранения настроек')),
    );
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '/parent/settings', element: <ParentSettingsPage /> }],
      {
        initialEntries: ['/parent/settings'],
      },
    );
    render(
      <MaxBridgeProvider bridge={new MockMaxBridge({ launchParams: null })}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <I18nextProvider i18n={i18n}>
              <RouterProvider router={router} />
            </I18nextProvider>
          </ToastProvider>
        </QueryClientProvider>
      </MaxBridgeProvider>,
    );

    await user.click(await screen.findByRole('button', { name: /^Язык/ }, WAIT));
    await user.click(await screen.findByRole('button', { name: /English/ }, WAIT));

    expect(await screen.findByText('Не удалось сохранить настройки', {}, WAIT)).toBeVisible();
    expect(i18n.language).toBe('ru');
  });
});
