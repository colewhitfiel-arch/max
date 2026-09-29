/**
 * `/join/:token` на MSW-моках (F19): ученик вступает в группу по ссылке преподавателя в один
 * тап; уже вступивший, сброшенная ссылка и открытие не из роли ученика — понятные сообщения.
 */
import { ToastProvider } from '@edu/ui';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, call } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { handlers } from '@/test/fake-api/handlers';
import { resetMockDb } from '@/test/fake-api/state';
import { JoinGroupPage } from './JoinGroupPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

/** Ссылка на группу робототехники Марии (выдаёт преподаватель). */
async function roboticsInvite(): Promise<string> {
  await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER']);
  const invite = await call(
    api.groups.getGroupInvite({ params: { groupId: DEMO_IDS.groups.roboticsA } }),
  );
  return invite.token;
}

function renderJoin(token: string) {
  const router = createMemoryRouter(
    [
      { path: '/join/:token', element: <JoinGroupPage /> },
      // В приложении `/` — RootRedirect: онбординг ученика или главная роли.
      { path: '/', element: <p>Корень</p> },
      { path: '/student', element: <p>Главная ученика</p> },
      { path: '/parent', element: <p>Главная родителя</p> },
    ],
    { initialEntries: [`/join/${token}`] },
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
  return router;
}

describe('JoinGroupPage', () => {
  it('новый ученик видит группу и вступает в один тап', async () => {
    const token = await roboticsInvite();
    await useAuthStore.getState().loginDev('max-kid-join', ['STUDENT']);
    const user = userEvent.setup();
    const router = renderJoin(token);

    expect(await screen.findByText('Робототехника, группа А', {}, WAIT)).toBeVisible();
    expect(screen.getByText(/Ведёт Мария Иванова · 2 ученика/)).toBeVisible();
    expect(screen.getByText(/^пн 15:00–16:30$/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Вступить в группу' }));

    expect(
      await screen.findByText('Готово! Ты в группе «Робототехника, группа А»', {}, WAIT),
    ).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), WAIT);
    const preview = await call(api.groups.getGroupInvitePreview({ params: { token } }));
    expect(preview).toMatchObject({ joined: true, studentsCount: 3 });
  });

  it('ученик уже в группе — «Ты уже в этой группе», без кнопки', async () => {
    const token = await roboticsInvite();
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    renderJoin(token);

    expect(await screen.findByText('Ты уже в этой группе', {}, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Вступить в группу' })).toBeNull();
  });

  it('сброшенная ссылка — «Ссылка не работает»', async () => {
    const token = await roboticsInvite();
    await call(api.groups.resetGroupInvite({ params: { groupId: DEMO_IDS.groups.roboticsA } }));
    await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
    renderJoin(token);

    expect(await screen.findByText('Ссылка не работает', {}, WAIT)).toBeVisible();
  });

  it('открыл родитель — подсказка открыть в аккаунте ученика', async () => {
    const token = await roboticsInvite();
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    renderJoin(token);

    expect(await screen.findByText('Откройте ссылку в аккаунте ученика', {}, WAIT)).toBeVisible();
  });
});
