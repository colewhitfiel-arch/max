/**
 * Кружки ребёнка у родителя без детей: запросы по ребёнку выключены, поэтому вместо вечного
 * скелета — пустое состояние с «Добавить ребёнка». Прошедшая дата платежа — «Оплата просрочена».
 */
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getResponse, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from '@/test/fake-api/handlers';
import { apiUrl } from '@/test/fake-api/lib';
import { resetMockDb } from '@/test/fake-api/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { useUiStore } from '@/shared/store/ui-store';
import { ChildClubsPage } from './ui/ChildClubsPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
  useUiStore.getState().setSelectedChildId(null);
});

describe('/parent/courses без детей', () => {
  it('пустое состояние с «Добавить ребёнка», а не вечный скелет', async () => {
    // Новый родитель: детей нет, выбранного ребёнка нет.
    await useAuthStore.getState().loginDev('max-parent-without-children', ['PARENT']);
    const user = userEvent.setup();
    const path = '/parent/courses';
    const router = createMemoryRouter([{ path, element: <ChildClubsPage /> }], {
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

describe('/parent/courses: оплата', () => {
  it('дата следующего платежа прошла — «Оплата просрочена», а не «Следующий платёж»', async () => {
    server.use(
      http.get(apiUrl('/parent/children/:studentId/clubs'), async ({ request }) => {
        const response = await getResponse(handlers, request.clone());
        const body = (await response!.json()) as { items: Array<Record<string, unknown>> };
        return HttpResponse.json({
          ...body,
          items: body.items.map((item) => ({
            ...item,
            paidUntil: null,
            nextPaymentAt: '2020-09-01',
          })),
        });
      }),
    );
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    useUiStore.getState().setSelectedChildId(DEMO_IDS.students.alexey);
    const path = '/parent/courses';
    const router = createMemoryRouter([{ path, element: <ChildClubsPage /> }], {
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

    expect((await screen.findAllByText(/Оплата просрочена с/, {}, WAIT)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Следующий платёж/)).not.toBeInTheDocument();
  });
});
