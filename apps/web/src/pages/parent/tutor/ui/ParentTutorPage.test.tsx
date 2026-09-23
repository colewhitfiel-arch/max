/**
 * Тьютор родителя на MSW-моках: чат о выбранном ребёнке (создание диалога, стартеры, стрим
 * ответа) и пустое состояние без детей.
 */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, call } from '@/shared/api/client';
import { handlers } from '@/shared/api/mocks/handlers';
import { apiError, apiUrl } from '@/shared/api/mocks/lib';
import { db, resetMockDb } from '@/shared/api/mocks/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { useUiStore } from '@/shared/store/ui-store';
import { ParentTutorPage } from './ParentTutorPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
  useUiStore.setState({ selectedChildId: null });
});

function renderTutor() {
  const router = createMemoryRouter([{ path: '/parent/tutor', element: <ParentTutorPage /> }], {
    initialEntries: ['/parent/tutor'],
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

describe('ParentTutorPage', () => {
  it(
    'история диалога о ребёнке и новый вопрос из поля ввода уходит в стрим',
    { timeout: 30_000 },
    async () => {
      // Ольга: в моках уже есть диалог о Алексее из двух сообщений.
      await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
      const user = userEvent.setup();
      renderTutor();

      expect(await screen.findByRole('heading', { level: 1, name: 'ИИ-тьютор' })).toBeVisible();
      expect(await screen.findByText('про ребёнка: Алексей Смирнов', {}, WAIT)).toBeVisible();
      expect(await screen.findByLabelText('Вы', {}, WAIT)).toHaveTextContent(
        'Как Алексей занимается в последнее время?',
      );

      await user.type(screen.getByRole('textbox'), 'Какие задания просрочены?');
      await user.click(screen.getByRole('button', { name: 'Отправить' }));

      // После стрима лента перечитывается: второй вопрос родителя и ответ про просрочки.
      await waitFor(() => {
        expect(screen.getAllByLabelText('Вы')).toHaveLength(2);
        const answers = screen.getAllByLabelText('Тьютор');
        expect(answers).toHaveLength(2);
        expect(answers[1]).toHaveTextContent(/просроч/i);
        expect(answers[1]).not.toHaveAttribute('aria-busy');
      }, WAIT);
      expect(screen.getByText('про ребёнка: Алексей Смирнов')).toBeVisible();
    },
  );

  it(
    'первый разговор: диалог создаётся с первым вопросом родителя',
    { timeout: 30_000 },
    async () => {
      // Мария (преподаватель и родитель Даши): диалогов с тьютором о Даше ещё нет.
      await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER', 'PARENT']);
      await useAuthStore.getState().switchRole('PARENT');
      const user = userEvent.setup();
      renderTutor();

      expect(await screen.findByText('Здравствуйте, Мария!', {}, WAIT)).toBeVisible();
      expect(screen.getByText('про ребёнка: Даша Иванова')).toBeVisible();
      await user.type(
        screen.getByRole('textbox'),
        'Как Даша занимается в последнее время?',
      );
      await user.click(screen.getByRole('button', { name: 'Отправить' }));

      expect(await screen.findByLabelText('Вы', {}, WAIT)).toHaveTextContent(
        'Как Даша занимается в последнее время?',
      );
      await waitFor(() => {
        const answer = screen.getByLabelText('Тьютор');
        expect(answer).toHaveTextContent(/Даша/);
        expect(answer).not.toHaveAttribute('aria-busy');
      }, WAIT);

      const children = await call(api.family.listChildren());
      const studentId = children.items[0]!.student.id;
      const list = await call(api.ai.listParentConversations({ params: { studentId }, query: {} }));
      expect(list.items).toHaveLength(1);
    },
  );

  it('несколько детей: подпись в шапке открывает выбор, чат переключается на другого ребёнка', async () => {
    // У Ольги в моках двое детей: Алексей и Даша.
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const user = userEvent.setup();
    renderTutor();

    await user.click(
      await screen.findByRole('button', { name: 'про ребёнка: Алексей Смирнов' }, WAIT),
    );
    const sheet = await screen.findByRole('dialog', { name: 'О ком поговорим?' }, WAIT);
    await user.click(within(sheet).getByRole('button', { name: /Даша Иванова/ }));

    expect(
      await screen.findByRole('button', { name: 'про ребёнка: Даша Иванова' }, WAIT),
    ).toBeVisible();
    expect(await screen.findByText('Здравствуйте, Ольга!', {}, WAIT)).toBeVisible();
    expect(useUiStore.getState().selectedChildId).not.toBeNull();
  });

  it('диалог о ребёнке не создался, потом говорили о другом — при возврате ошибка с повтором', async () => {
    // Ольга ещё ни о ком не спрашивала; создание диалога о Даше один раз падает.
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    db.parentConversationIds.clear();
    const children = await call(api.family.listChildren());
    const dasha = children.items.find((item) => item.student.user.firstName === 'Даша')!;
    useUiStore.setState({ selectedChildId: dasha.student.id });
    server.use(
      http.post(
        apiUrl('/parent/children/:studentId/ai/conversations'),
        () => apiError('INTERNAL', 'Сбой'),
        { once: true },
      ),
    );
    const user = userEvent.setup();
    renderTutor();

    expect(await screen.findByText('Не удалось загрузить', {}, WAIT)).toBeVisible();

    // Переключились на Алексея: диалог о нём создаётся успешно.
    await user.click(screen.getByRole('button', { name: 'про ребёнка: Даша Иванова' }));
    let sheet = await screen.findByRole('dialog', { name: 'О ком поговорим?' }, WAIT);
    await user.click(within(sheet).getByRole('button', { name: /Алексей Смирнов/ }));
    expect(await screen.findByText('Здравствуйте, Ольга!', {}, WAIT)).toBeVisible();

    // Вернулись к Даше: ошибка и «Повторить», а не вечный скелет.
    await user.click(screen.getByRole('button', { name: 'про ребёнка: Алексей Смирнов' }));
    sheet = await screen.findByRole('dialog', { name: 'О ком поговорим?' }, WAIT);
    await user.click(within(sheet).getByRole('button', { name: /Даша Иванова/ }));
    await user.click(await screen.findByRole('button', { name: 'Повторить' }, WAIT));
    expect(await screen.findByText('Здравствуйте, Ольга!', {}, WAIT)).toBeVisible();
    expect(screen.getByRole('button', { name: 'про ребёнка: Даша Иванова' })).toBeVisible();
  });

  it('без детей — пустое состояние и «Добавить ребёнка» открывает sheet', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const children = await call(api.family.listChildren());
    for (const child of children.items) {
      await call(api.family.unlinkChild({ params: { studentId: child.student.id } }));
    }
    const user = userEvent.setup();
    renderTutor();

    expect(await screen.findByText('Пока не о ком рассказать', {}, WAIT)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Добавить ребёнка' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThan(0);
  });
});
