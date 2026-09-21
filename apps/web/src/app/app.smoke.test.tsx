/**
 * Smoke-тест всего foundation в mock-режиме: Providers → App → bootstrap → /auth → dev-вход →
 * shell роли → страницы с данными из MSW-мира (msw/node). Проверяет проводку, не вёрстку.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import '@/shared/i18n';
import { handlers } from '@/shared/api/mocks/handlers';
import { resetMockDb } from '@/shared/api/mocks/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { useUiStore } from '@/shared/store/ui-store';
import { App } from './App';
import { Providers } from './providers';
import { router } from './router';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

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

async function resetApp() {
  await router.navigate('/', { replace: true });
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
  useUiStore.setState({ theme: 'SYSTEM', selectedChildId: null, hydrated: false });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(resetApp);

const renderApp = () =>
  render(
    <Providers bridge={createBridge()}>
      <App />
    </Providers>,
  );

const findText = (text: string | RegExp) => screen.findByText(text, {}, WAIT);
/** Ждём заголовок экрана (h1 из PageHeader) — значит, lazy-страница загрузилась и роутер idle. */
const expectPage = async (title: string) => {
  await screen.findByRole('heading', { level: 1, name: title }, WAIT);
  await waitFor(() => expect(router.state.navigation.state).toBe('idle'), WAIT);
};
const nav = () => within(screen.getByRole('navigation', { name: 'Основная навигация' }));

describe('foundation smoke (mock API)', () => {
  it(
    'ученик: вход демо-пользователем → главная → курсы → профиль → выход',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup();
      renderApp();

      // Аноним попадает на /auth с демо-пользователями.
      await expectPage('Вход');
      await user.click(await findText('Алексей Смирнов'));

      // /student: главная с занятиями и заданиями из фикстур.
      await expectPage('Главная');
      expect(useAuthStore.getState().me?.activeRole).toBe('STUDENT');
      expect(router.state.location.pathname).toBe('/student');
      await findText(/Датчики расстояния/);
      await findText('Домашнее задание: схема с датчиком');
      expect(screen.getByText('Комментарий ИИ', { exact: false })).toBeInTheDocument();

      // Нижнее меню → курсы.
      await user.click(nav().getByRole('button', { name: 'Курсы' }));
      await expectPage('Курсы');
      await findText('Основы робототехники');
      expect(router.state.location.pathname).toBe('/student/courses');

      // Профиль: траектория и код для родителя.
      await user.click(nav().getByRole('button', { name: 'Профиль' }));
      await expectPage('Профиль');
      await findText('ALX123');
      await findText(/Сильные стороны/);

      // Настройки → выход → снова экран входа.
      await user.click(nav().getByRole('button', { name: 'Настройки' }));
      await expectPage('Настройки');
      await user.click(await screen.findByRole('button', { name: 'Выйти' }, WAIT));
      await expectPage('Вход');
      expect(useAuthStore.getState().status).toBe('anonymous');
    },
  );

  it(
    'преподаватель: главная и группы → смена роли на родителя → шапка с ребёнком',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup();
      renderApp();
      await expectPage('Вход');
      await user.click(await findText('Мария Иванова'));

      await expectPage('Главная');
      expect(router.state.location.pathname).toBe('/teacher');
      await findText('Робототехника, группа А');
      await findText('На проверку');

      await user.click(nav().getByRole('button', { name: 'Группы' }));
      await expectPage('Группы');
      await user.click(await findText('Python, группа А'));
      await expectPage('Python, группа А');
      await findText('Алексей Смирнов');
      expect(router.state.location.pathname).toMatch(/^\/teacher\/groups\//);

      // Ещё → Сменить роль → Родитель.
      await user.click(nav().getByRole('button', { name: 'Ещё' }));
      await expectPage('Ещё');
      await user.click(await screen.findByRole('button', { name: 'Родитель' }, WAIT));

      await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
      expect(useAuthStore.getState().me?.activeRole).toBe('PARENT');
      await expectPage('Главная');
      // В шапке — выбор ребёнка (Даша), на главной — её данные.
      const switcher = await screen.findByRole('combobox', { name: 'Ребёнок' }, WAIT);
      expect(within(switcher).getByRole('option', { name: 'Даша Иванова' })).toBeInTheDocument();
      await findText('Пропущенные занятия');
    },
  );

  it('неизвестный маршрут → 404-страница приложения', { timeout: 40_000 }, async () => {
    const user = userEvent.setup();
    renderApp();
    await expectPage('Вход');
    await user.click(await findText('Ольга Смирнова'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
    await expectPage('Главная');
    // Имя ребёнка есть и в шапке (select), и в заголовке секции.
    expect((await screen.findAllByText('Алексей Смирнов', {}, WAIT)).length).toBeGreaterThan(0);

    await router.navigate('/parent/unknown-page');
    await findText('Страница не найдена');
  });
});
