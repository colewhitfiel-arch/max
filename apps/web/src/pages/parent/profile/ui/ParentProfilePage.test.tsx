/**
 * Профиль родителя на MSW-моках: шапка с фото (смена через files flow purpose AVATAR),
 * витрина «Кружки для ваших детей» с отметкой кружков ребёнка и заглушкой записи.
 */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, call } from '@/shared/api/client';
import { handlers } from '@/shared/api/mocks/handlers';
import { resetMockDb } from '@/shared/api/mocks/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { useUiStore } from '@/shared/store/ui-store';
import { ParentProfilePage } from './ParentProfilePage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
  useUiStore.setState({ selectedChildId: null });
});

function renderProfile() {
  const router = createMemoryRouter([{ path: '/parent/profile', element: <ParentProfilePage /> }], {
    initialEntries: ['/parent/profile#offers'],
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
}

describe('ParentProfilePage', () => {
  it('витрина кружков: кружки ребёнка отмечены, «Записать» — заглушка', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const children = useAuthStore.getState().me?.parent?.childrenCount ?? 0;
    const user = userEvent.setup();
    renderProfile();

    expect(await screen.findByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible();
    expect(screen.getByText('Ольга Смирнова')).toBeVisible();
    expect(children).toBeGreaterThan(0);

    const offers = screen.getByRole('region', { name: 'Кружки для ваших детей' });
    const enroll = await within(offers).findAllByRole('button', { name: /^Записать: / }, WAIT);
    expect(enroll.length).toBeGreaterThan(0);
    // Алексей уже ходит на робототехнику — у неё нет «Записать», есть отметка.
    expect(within(offers).getAllByText('Уже ходит').length).toBeGreaterThan(0);
    expect(within(offers).queryByRole('button', { name: /Робототехника/ })).toBeNull();

    await user.click(enroll[0]!);
    expect(
      await screen.findByText('Скоро можно будет записаться прямо здесь', {}, WAIT),
    ).toBeVisible();
  });

  it('число детей — по списку детей: ребёнок принял приглашение уже после входа', async () => {
    // Новый родитель: при входе детей нет, me.parent.childrenCount = 0 и больше не обновится.
    await useAuthStore.getState().loginDev('max-parent-late-child', ['PARENT']);
    const invite = await call(api.family.createChildInvite());
    const parentSession = useAuthStore.getState();
    // Ребёнок принял ссылку со своего аккаунта.
    await parentSession.loginDev('max-student-1', ['STUDENT']);
    await call(api.family.acceptParentInvite({ params: { token: invite.token } }));
    useAuthStore.setState({
      accessToken: parentSession.accessToken,
      refreshToken: parentSession.refreshToken,
      me: parentSession.me,
    });
    queryClient.clear();
    expect(useAuthStore.getState().me?.parent?.childrenCount).toBe(0);

    renderProfile();
    expect(await screen.findByText(/1 ребёнок/, {}, WAIT)).toBeVisible();
    expect(screen.queryByText(/Дети ещё не добавлены/)).toBeNull();
  });

  it('смена фото: картинка загружается как AVATAR и попадает в me', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const user = userEvent.setup();
    renderProfile();

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByRole('button', { name: 'Убрать фото' })).toBeNull();

    const photo = new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Выбрать фото профиля'), photo);

    expect(await screen.findByText('Фото обновлено', {}, WAIT)).toBeVisible();
    await waitFor(() => expect(useAuthStore.getState().me?.user.avatarUrl).toBeTruthy(), WAIT);

    await user.click(await screen.findByRole('button', { name: 'Убрать фото' }, WAIT));
    expect(await screen.findByText('Фото убрано', {}, WAIT)).toBeVisible();
    expect(useAuthStore.getState().me?.user.avatarUrl).toBeNull();
  });
});
