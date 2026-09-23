/**
 * Оплата и кружки родителя без детей: запросы по ребёнку выключены, поэтому вместо вечного
 * скелета — пустое состояние с «Добавить ребёнка» (редиректа на /parent/children больше нет).
 */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import type { ComponentType } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ChildClubsPage } from '@/pages/parent/courses/ui/ChildClubsPage';
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

describe.each<[string, ComponentType]>([
  ['/parent/payments', PaymentsPage],
  ['/parent/courses', ChildClubsPage],
])('%s без детей', (path, Page) => {
  it('пустое состояние с «Добавить ребёнка», а не вечный скелет', async () => {
    // Новый родитель: детей нет, выбранного ребёнка нет.
    await useAuthStore.getState().loginDev('max-parent-without-children', ['PARENT']);
    const user = userEvent.setup();
    const router = createMemoryRouter([{ path, element: <Page /> }], { initialEntries: [path] });
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
