/**
 * Смена фото профиля на MSW-моках: картинка загружается через files flow (purpose AVATAR),
 * `PUT /me/avatar` кладёт ссылку в me, «Убрать фото» — `fileId: null`. Экраны профиля родителя
 * и преподавателя компонент пока не показывают (на api `PUT /me/avatar` = 501, docs/04).
 */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from '@/test/fake-api/handlers';
import { resetMockDb } from '@/test/fake-api/state';
import { queryClient } from '@/shared/api/query-client';
import { useMe } from '@/shared/auth/hooks';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { ChangeAvatar } from './ChangeAvatar';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

function CurrentAvatar() {
  const me = useMe();
  return <ChangeAvatar hasPhoto={Boolean(me?.user.avatarUrl)} />;
}

describe('ChangeAvatar', () => {
  it('картинка загружается как AVATAR и попадает в me; «Убрать фото» её снимает', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const user = userEvent.setup();
    render(
      <MaxBridgeProvider bridge={new MockMaxBridge({ launchParams: null })}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <I18nextProvider i18n={i18n}>
              <CurrentAvatar />
            </I18nextProvider>
          </ToastProvider>
        </QueryClientProvider>
      </MaxBridgeProvider>,
    );

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
