/**
 * Оплата родителя. Без детей запросы по ребёнку выключены, поэтому вместо вечного скелета —
 * пустое состояние с «Добавить ребёнка» (редиректа на /parent/children больше нет); то же для
 * «Кружков ребёнка» — в `pages/parent/courses/ChildClubsPage.test.tsx`.
 */
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handlers } from '@/shared/api/mocks/handlers';
import { resetMockDb } from '@/shared/api/mocks/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { useUiStore } from '@/shared/store/ui-store';
import { PaymentsPage } from './PaymentsPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
  useUiStore.getState().setSelectedChildId(null);
});

describe('/parent/payments без детей', () => {
  it('пустое состояние с «Добавить ребёнка», а не вечный скелет', async () => {
    // Новый родитель: детей нет, выбранного ребёнка нет.
    await useAuthStore.getState().loginDev('max-parent-without-children', ['PARENT']);
    const user = userEvent.setup();
    const path = '/parent/payments';
    const router = createMemoryRouter([{ path, element: <PaymentsPage /> }], {
      initialEntries: [path],
    });
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

    expect(await screen.findByText('Детей пока нет', {}, WAIT)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Добавить ребёнка' }));
    expect(await screen.findByRole('dialog', { name: 'Добавить ребёнка' }, WAIT)).toBeVisible();
  });
});

describe('/parent/payments: оплата периода', () => {
  it('«Оплатить» → страница оплаты, итог — после опроса статуса платежа', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    useUiStore.getState().setSelectedChildId(DEMO_IDS.students.alexey);
    const bridge = new MockMaxBridge({ launchParams: null });
    const openLink = vi.spyOn(bridge, 'openLink').mockImplementation(() => {});
    const user = userEvent.setup();
    const router = createMemoryRouter([{ path: '/parent/payments', element: <PaymentsPage /> }], {
      initialEntries: ['/parent/payments'],
    });
    render(
      <MaxBridgeProvider bridge={bridge}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <I18nextProvider i18n={i18n}>
              <RouterProvider router={router} />
            </I18nextProvider>
          </ToastProvider>
        </QueryClientProvider>
      </MaxBridgeProvider>,
    );

    const buttons = await screen.findAllByRole('button', { name: 'Оплатить' }, WAIT);
    await user.click(buttons[0]!);

    await waitFor(() => expect(openLink).toHaveBeenCalledTimes(1), WAIT);
    expect(openLink.mock.calls[0]![0]).toMatch(/^https:\/\/pay\.example\.com\/mock\//);

    // Fake-провайдер моков подтверждает оплату через 5 с — экран узнаёт итог опросом.
    // Новый платёж появился в истории как ожидающий…
    expect(await screen.findByText('Ожидает оплаты', {}, WAIT)).toBeVisible();
    // …итог — тостом, а история перезапрошена.
    const toasts = screen.getByRole('region', { name: 'Уведомления' });
    expect(await within(toasts).findByText('Оплачено', {}, { timeout: 15_000 })).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Ожидает оплаты')).toBeNull(), {
      timeout: 5_000,
    });
  }, 30_000);
});
