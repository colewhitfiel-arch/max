/**
 * Smoke-тест всего foundation в mock-режиме: Providers → App → bootstrap → /auth → dev-вход →
 * shell роли → страницы с данными из MSW-мира (msw/node). Проверяет проводку, не вёрстку.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { i18n, setLanguage } from '@/shared/i18n';
import { handlers } from '@/test/fake-api/handlers';
import { db, findUserByMaxId, resetMockDb } from '@/test/fake-api/state';
import { MOCK_INVITE_TOKENS } from '@/test/fake-api/world-extras';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { useUiStore } from '@/shared/store/ui-store';
import { App } from './App';
import { Providers } from './providers';
import { router } from './router';
import { resetStartParamForTests } from './start-param';

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

/**
 * Как в браузере: прерванный переход роутера отменяется. Общий shim в `test/setup.ts` убирает
 * `signal` у `Request` (jsdom и undici несовместимы), и прерванный переход там всё равно
 * фиксируется — гонка перехода по диплинку с редиректом с `/` была бы не видна.
 */
function abortableNavigations(): () => void {
  const Base = globalThis.Request;
  class AbortableRequest extends Base {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init);
      if (init?.signal) Object.defineProperty(this, 'signal', { value: init.signal });
    }
  }
  globalThis.Request = AbortableRequest;
  return () => {
    globalThis.Request = Base;
  };
}

async function resetApp() {
  await router.navigate('/', { replace: true });
  resetAuthStore();
  resetStartParamForTests();
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
const expectPage = async (title: string | RegExp) => {
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

      // /student: главная по макету — посещения за неделю и расписание на сегодня из фикстур.
      await expectPage('Главная');
      expect(useAuthStore.getState().me?.activeRole).toBe('STUDENT');
      expect(router.state.location.pathname).toBe('/student');
      await findText('Посещения');
      await findText('Робототехника');
      expect(screen.getByRole('button', { name: 'Следующий день' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Предыдущий день' })).toBeDisabled();

      // Нижнее меню (центральная кнопка) → задания: рекомендации и карта планет из фикстур.
      await user.click(nav().getByRole('button', { name: 'Задания' }));
      await expectPage('Задания');
      await findText('Рекомендации на сегодня');
      expect(router.state.location.pathname).toBe('/student/assignments');
      expect(
        screen.getByRole('button', { name: /^Робототехника: \d+ баллов, открытых заданий: 2$/ }),
      ).toBeInTheDocument();

      // Курсы — по прямому адресу.
      await router.navigate('/student/courses');
      await expectPage('Курсы');
      await findText('Основы робототехники');

      // Профиль: траектория (свёрнута — раскрывается кнопкой) и код для родителя.
      await user.click(nav().getByRole('button', { name: 'Профиль' }));
      await expectPage('Профиль');
      await findText('ALX123');
      await user.click(screen.getByRole('button', { name: 'Показать траекторию' }));
      await findText(/Сильные стороны/);

      // Настройки → выход → снова экран входа.
      await user.click(nav().getByRole('button', { name: 'Настройки' }));
      await expectPage('Настройки');
      await user.click(await screen.findByRole('button', { name: 'Выйти из аккаунта' }, WAIT));
      await expectPage('Вход');
      expect(useAuthStore.getState().status).toBe('anonymous');
    },
  );

  it(
    'преподаватель: главная → кошелёк → успеваемость → ученик → настройки → смена роли на родителя',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup();
      renderApp();
      await expectPage('Вход');
      await user.click(await findText('Мария Иванова'));

      // /teacher: главная по макету — оранжевый акцент, чип кошелька без плюса и расписание дня,
      // где вторая колонка — номер группы (у Марии сегодня Python «012» и робототехника «001»).
      await expectPage('Главная');
      expect(router.state.location.pathname).toBe('/teacher');
      expect(useAuthStore.getState().me?.activeRole).toBe('TEACHER');
      expect(document.documentElement).toHaveAttribute('data-accent', 'orange');
      await findText('001');
      // Нижнее меню: центральная кнопка — успеваемость; группы и «Ещё» переехали в настройки.
      expect(nav().getByRole('button', { name: 'Задания' })).toBeInTheDocument();
      expect(nav().queryByRole('button', { name: 'Группы' })).not.toBeInTheDocument();
      expect(nav().queryByRole('button', { name: 'Ещё' })).not.toBeInTheDocument();

      // Чип кошелька → кошелёк (баланс, транзакции, «Вам должны») → «Баланс ✕» → главная.
      await user.click(
        await screen.findByRole('button', { name: /^Баланс .+, открыть кошелёк$/ }, WAIT),
      );
      await expectPage(/^Кошелёк/);
      expect(router.state.location.pathname).toBe('/teacher/wallet');
      await screen.findByRole('heading', { level: 2, name: 'Транзакции' }, WAIT);
      await screen.findByRole('heading', { level: 2, name: 'Вам должны' }, WAIT);
      await user.click(screen.getByRole('button', { name: 'Закрыть баланс' }));
      await expectPage('Главная');
      expect(router.state.location.pathname).toBe('/teacher');

      // Меню «Успеваемость» → «Общая успеваемость» → строка группы 001 → ученики → ученик.
      await user.click(nav().getByRole('button', { name: 'Успеваемость' }));
      await expectPage('Общая успеваемость');
      expect(router.state.location.pathname).toBe('/teacher/performance');
      await user.click(await screen.findByRole('button', { name: 'Группа 001: ученики' }, WAIT));
      await expectPage('Группа 001');
      await user.click(await findText('Алексей Смирнов'));
      await expectPage(/Смирнов А\./);
      expect(router.state.location.pathname).toMatch(/^\/teacher\/students\//);
      await findText('Посещения');
      // «Успеваемость ✕» — назад к ученикам группы.
      await user.click(screen.getByRole('button', { name: 'Закрыть успеваемость' }));
      await expectPage('Группа 001');

      // Настройки → строка «Роль» открывает sheet → Родитель.
      await user.click(nav().getByRole('button', { name: 'Настройки' }));
      await expectPage('Настройки');
      expect(router.state.location.pathname).toBe('/teacher/settings');
      await user.click(await screen.findByRole('button', { name: /^Роль/ }, WAIT));
      await user.click(await screen.findByRole('button', { name: 'Родитель' }, WAIT));

      await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
      expect(useAuthStore.getState().me?.activeRole).toBe('PARENT');
      await expectPage('Главная');
      // Режим родителя — зелёный акцент (у преподавателя был оранжевый).
      expect(document.documentElement).toHaveAttribute('data-accent', 'green');
      // Шапки shell больше нет: дети — сердца на главной (выбрана Даша), рядом кошелёк;
      // под сердцами — расписание и «Выполненные задания» выбранного ребёнка.
      expect(screen.queryByRole('combobox', { name: 'Ребёнок' })).not.toBeInTheDocument();
      const hearts = await screen.findByRole('listbox', { name: 'Дети' }, WAIT);
      expect(
        await within(hearts).findByRole('option', { name: 'Иванова Д.', selected: true }, WAIT),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
      await screen.findByRole('button', { name: /^Баланс .+, пополнить$/ }, WAIT);
      await screen.findByRole('heading', { level: 2, name: 'Выполненные задания' }, WAIT);
      // Нижнее меню родителя: центральная кнопка — аналитика.
      expect(nav().getByRole('button', { name: 'Аналитика' })).toBeInTheDocument();
      expect(nav().getByRole('button', { name: 'ИИ-тьютор' })).toBeInTheDocument();
    },
  );

  it(
    'родитель: кошелёк → пополнение (заглушка) → главная; неизвестный маршрут → 404',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup();
      renderApp();
      await expectPage('Вход');
      await user.click(await findText('Ольга Смирнова'));
      await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
      await expectPage('Главная');
      // Подпись выбранного сердца — краткое имя ребёнка.
      await screen.findByRole('option', { name: 'Смирнов А.', selected: true }, WAIT);

      // Кошелёк в шапке → пополнение: быстрый выбор суммы → «Пополнить» → обратно на главную.
      await user.click(await screen.findByRole('button', { name: /^Баланс .+, пополнить$/ }, WAIT));
      await expectPage('Пополнение баланса');
      expect(router.state.location.pathname).toBe('/parent/wallet');
      await user.click(screen.getByRole('button', { name: /^1\s?000\s₽$/ }));
      await user.click(screen.getByRole('button', { name: /^Пополнить на/ }));
      await findText('Баланс пополнен (демо-режим)');
      await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);

      await router.navigate('/parent/unknown-page');
      await findText('Страница не найдена');
    },
  );

  it(
    'диплинк приглашения без сессии (?startapp=invite_…): вход → экран приглашения',
    { timeout: 40_000 },
    async () => {
      const restoreRequest = abortableNavigations();
      try {
        const token = MOCK_INVITE_TOKENS.pending;
        const bridge = createBridge();
        bridge.getStartParam = () => `invite_${token}`;
        const user = userEvent.setup();
        render(
          <Providers bridge={bridge}>
            <App />
          </Providers>,
        );

        // Аноним уходит на вход с экрана приглашения, а не с корня: путь запомнен в state.from.
        await expectPage('Вход');
        expect(router.state.location.state).toEqual({ from: `/invite/${token}` });

        // После входа ученик возвращается на приглашение, а не на главную или онбординг.
        await user.click(await findText('Алексей Смирнов'));
        await expectPage('Приглашение');
        expect(router.state.location.pathname).toBe(`/invite/${token}`);
        await findText('Мария Иванова хочет следить за твоими успехами');
      } finally {
        restoreRequest();
      }
    },
  );

  it(
    'язык интерфейса — всегда русский, даже если в настройках на сервере сохранён en',
    { timeout: 40_000 },
    async () => {
      // Так бывает у пользователя из английского клиента MAX или выбравшего en раньше:
      // выбора языка в настройках нет, вернуть русский он бы не смог.
      const parent = findUserByMaxId('max-parent-1');
      expect(parent).toBeDefined();
      db.settings.set(parent!.id, { theme: 'SYSTEM', locale: 'en' });
      try {
        const user = userEvent.setup();
        renderApp();
        await expectPage('Вход');
        await user.click(await findText('Ольга Смирнова'));
        await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
        expect(useAuthStore.getState().me?.settings.locale).toBe('en');

        await expectPage('Главная');
        expect(i18n.language).toBe('ru');
        expect(nav().getByRole('button', { name: 'Аналитика' })).toBeInTheDocument();
      } finally {
        await setLanguage('ru');
      }
    },
  );
});
