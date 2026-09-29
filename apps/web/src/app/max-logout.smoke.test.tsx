/**
 * Внутри MAX (`VITE_AUTH_MODE=max`): вход по подписи при старте → настройки → «Выйти из аккаунта»
 * → экран входа сам входит заново по подписи → главная. На стенде после выхода оставался чёрный
 * экран: сервер отвечал 200 на повторный /auth/max, а клиент дальше ничего не рисовал.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import type * as ConfigModule from '@/shared/config';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { useUiStore } from '@/shared/store/ui-store';
import { handlers } from '@/test/fake-api/handlers';
import { resetMockDb } from '@/test/fake-api/state';
import { App } from './App';
import { Providers } from './providers';
import { router } from './router';
import { resetStartParamForTests } from './start-param';

vi.mock('@/shared/config', async (importOriginal) => {
  const original = await importOriginal<typeof ConfigModule>();
  return { ...original, config: { ...original.config, authMode: 'max', isDev: false } };
});

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

function createBridge() {
  const memory = new Map<string, string>();
  return new MockMaxBridge({
    launchParams: 'query_id=1&user=%7B%22id%22%3A42%7D&auth_date=1&hash=abc',
    storage: {
      get: async (key) => memory.get(key) ?? null,
      set: async (key, value) => void memory.set(key, value),
      remove: async (key) => void memory.delete(key),
    },
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  await router.navigate('/', { replace: true });
  resetAuthStore();
  resetStartParamForTests();
  queryClient.clear();
  resetMockDb();
  useUiStore.setState({ theme: 'SYSTEM', selectedChildId: null, hydrated: false });
});

const expectPage = async (title: string | RegExp) => {
  await screen.findByRole('heading', { level: 1, name: title }, WAIT);
  await waitFor(() => expect(router.state.navigation.state).toBe('idle'), WAIT);
};

describe('MAX: выход из аккаунта и повторный вход по подписи', () => {
  it(
    'после «Выйти из аккаунта» приложение снова входит по подписи и показывает главную',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup();
      render(
        <Providers bridge={createBridge()}>
          <App />
        </Providers>,
      );

      // Старт внутри MAX: сохранённой сессии нет → вход по launch-параметрам → главная ученика.
      await expectPage('Главная');
      expect(useAuthStore.getState().status).toBe('authenticated');

      await router.navigate('/student/settings');
      await expectPage('Настройки');
      await user.click(await screen.findByRole('button', { name: 'Выйти из аккаунта' }, WAIT));

      // Экран входа в max-режиме сам повторяет вход по подписи — и снова главная, а не пустота.
      await expectPage('Главная');
      expect(useAuthStore.getState().status).toBe('authenticated');
      expect(router.state.location.pathname).toBe('/student');
    },
  );
});
