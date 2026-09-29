/**
 * Демонстрационный режим целиком на mock-мире (msw/node): кнопка на экране входа → все шаги
 * тура по ролям. На каждом шаге — нужный демо-пользователь, экран шага и подсвечиваемый
 * элемент (`data-tour`) в DOM. Ловит сломанные цели и пути после правок экранов.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PERSONAS, DEMO_STEPS, useDemoTourStore } from '@/features/demo-tour';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { useUiStore } from '@/shared/store/ui-store';
import { handlers } from '@/test/fake-api/handlers';
import { resetMockDb } from '@/test/fake-api/state';
import { App } from './App';
import { Providers } from './providers';
import { router } from './router';
import { resetStartParamForTests } from './start-param';

const server = setupServer(...handlers);
const WAIT = { timeout: 15_000 };

function createBridge() {
  const memory = new Map<string, string>();
  return new MockMaxBridge({
    launchParams: null,
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
  useDemoTourStore.getState().stop();
  await router.navigate('/', { replace: true });
  resetAuthStore();
  resetStartParamForTests();
  queryClient.clear();
  resetMockDb();
  useUiStore.setState({ theme: 'SYSTEM', selectedChildId: null, hydrated: false });
});

describe('демонстрационный режим (mock API)', () => {
  it(
    'проходит все шаги: пользователь, экран и подсветка на каждом',
    { timeout: 180_000 },
    async () => {
      const user = userEvent.setup();
      render(
        <Providers bridge={createBridge()}>
          <App />
        </Providers>,
      );

      await user.click(await screen.findByRole('button', { name: 'Демонстрационный режим' }, WAIT));

      for (const [index, step] of DEMO_STEPS.entries()) {
        const title = i18n.t(`demo:steps.${step.id}.title`);
        const dialog = await screen.findByRole('dialog', { name: title }, WAIT);
        expect(dialog).toHaveTextContent(`${index + 1}/${DEMO_STEPS.length}`);

        if (step.persona) {
          const persona = DEMO_PERSONAS[step.persona];
          const me = useAuthStore.getState().me;
          expect(me?.user.id, step.id).toBe(persona.userId);
          expect(me?.activeRole, step.id).toBe(persona.role);
        }
        if (step.path) expect(window.location.pathname, step.id).toBe(step.path);
        if (step.target) {
          expect(
            document.querySelector(`[data-tour="${step.target}"]`),
            `${step.id}: нет [data-tour="${step.target}"]`,
          ).not.toBeNull();
        }

        const last = index === DEMO_STEPS.length - 1;
        await user.click(within(dialog).getByRole('button', { name: last ? 'Готово' : 'Далее' }));
      }

      await waitFor(() => expect(useDemoTourStore.getState().active).toBe(false));
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('с приветствия можно сразу перейти к роли; крестик закрывает тур', async () => {
    const user = userEvent.setup();
    render(
      <Providers bridge={createBridge()}>
        <App />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Демонстрационный режим' }, WAIT));
    await screen.findByRole('dialog', { name: 'Добро пожаловать!' }, WAIT);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Родитель' }));

    await screen.findByRole('dialog', { name: 'Дети' }, WAIT);
    expect(useAuthStore.getState().me?.activeRole).toBe('PARENT');
    expect(window.location.pathname).toBe('/parent');

    await user.click(screen.getByRole('button', { name: 'Закрыть тур' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Тур закрыт, приложение остаётся на экране в роли демо-пользователя.
    expect(window.location.pathname).toBe('/parent');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});
