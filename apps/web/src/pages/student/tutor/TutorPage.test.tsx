/**
 * Чаты тьютора в духе ChatGPT (фейковый API): вход в раздел — новый чат; первая отправка создаёт
 * диалог и переводит адрес на него; история в боковой панели открывает старый чат; «Новый чат»
 * возвращает к пустому; удаление убирает чат из истории.
 */
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlers } from '@/test/fake-api/handlers';
import { apiUrl } from '@/test/fake-api/lib';
import { resetMockDb } from '@/test/fake-api/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { studentTutorRoutes } from './routes';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => {
  await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
});
afterEach(() => {
  server.resetHandlers();
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

function renderTutor(path = '/student/tutor') {
  const router = createMemoryRouter([{ path: '/student', children: studentTutorRoutes }], {
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
  return router;
}

describe('TutorPage', () => {
  it('раздел открывает новый чат; первая отправка создаёт диалог и переводит адрес на него', async () => {
    const user = userEvent.setup();
    const router = renderTutor();

    // Новый чат: приветствие, а не последний диалог из истории.
    expect(await screen.findByText(/Привет, Алексей!/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('Что мне сегодня нужно сделать?')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Как подготовиться?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(
      () => expect(router.state.location.pathname).toMatch(/^\/student\/tutor\/[0-9a-f-]{36}$/),
      WAIT,
    );
    // Ответ пришёл и лента та же: вопрос на месте, стрим не оборвался переходом.
    await waitFor(
      () => expect(screen.getAllByRole('group', { name: 'Тьютор' }).length).toBeGreaterThan(0),
      WAIT,
    );
    expect(screen.getByText('Как подготовиться?')).toBeInTheDocument();

    // История: новый чат сверху под своим заголовком, старый — тоже есть.
    await user.click(screen.getByRole('button', { name: 'История чатов' }));
    const drawer = await screen.findByRole('dialog', { name: 'История чатов' });
    expect(await within(drawer).findByText('Как подготовиться?', {}, WAIT)).toBeInTheDocument();
    expect(within(drawer).getByText('Что мне сделать сегодня?')).toBeInTheDocument();
  });

  it('второй вопрос, пока грузится лента после первого ответа: чат не пустеет', async () => {
    // Лента диалога приходит с задержкой — второй вопрос уходит, пока она ещё грузится.
    server.use(
      http.get(apiUrl('/ai/conversations/:conversationId/messages'), async () => {
        await delay(1500);
      }),
    );
    const user = userEvent.setup();
    renderTutor();
    await screen.findByText(/Привет, Алексей!/, {}, WAIT);
    const input = screen.getByRole('textbox', { name: 'Сообщение' });

    await user.type(input, 'Первый вопрос');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    // Первый ответ дописан: поле снова принимает вопрос, а лента с сервера ещё не пришла.
    await screen.findByText(/покажу пример из твоего курса/, {}, WAIT);
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument(),
      WAIT,
    );

    await user.type(input, 'Второй вопрос');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    // В ленте оба вопроса и оба ответа; приветствие пустого чата не вернулось.
    await waitFor(() => {
      expect(screen.getByText('Первый вопрос')).toBeInTheDocument();
      expect(screen.getByText('Второй вопрос')).toBeInTheDocument();
      expect(screen.getAllByRole('group', { name: 'Тьютор' })).toHaveLength(2);
    }, WAIT);
    expect(screen.queryByText(/Привет, Алексей!/)).not.toBeInTheDocument();
    // Два стрима и задержанные ленты — дольше стандартных 5 с.
  }, 20_000);

  it('пока новый чат создаётся, «Остановить» нет — только индикатор; во время ответа есть', async () => {
    // Диалог создаётся медленно: стрима ещё нет, останавливать нечего.
    server.use(
      http.post(apiUrl('/ai/conversations'), async () => {
        await delay(1500);
      }),
    );
    const user = userEvent.setup();
    renderTutor();
    await screen.findByText(/Привет, Алексей!/, {}, WAIT);

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Как подготовиться?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Отправить' })).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    );
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument();

    // Ответ пошёл — «Остановить» на месте.
    expect(await screen.findByRole('button', { name: 'Остановить' }, WAIT)).toBeInTheDocument();
  });

  it('старый чат открывается из истории; «Новый чат» возвращает к пустому', async () => {
    const user = userEvent.setup();
    const router = renderTutor();
    await screen.findByText(/Привет, Алексей!/, {}, WAIT);

    await user.click(screen.getByRole('button', { name: 'История чатов' }));
    const drawer = await screen.findByRole('dialog', { name: 'История чатов' });
    await user.click(await within(drawer).findByText('Что мне сделать сегодня?', {}, WAIT));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/student/tutor/${DEMO_IDS.conversation}`),
    );
    expect(await screen.findByText('Что мне сегодня нужно сделать?', {}, WAIT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Новый чат' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/student/tutor'));
    expect(await screen.findByText(/Привет, Алексей!/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('Что мне сегодня нужно сделать?')).not.toBeInTheDocument();
  });

  it('удаление чата из истории: подтверждение, чат пропадает, открытый — сменяется новым', async () => {
    const user = userEvent.setup();
    const router = renderTutor(`/student/tutor/${DEMO_IDS.conversation}`);
    await screen.findByText('Что мне сегодня нужно сделать?', {}, WAIT);

    await user.click(screen.getByRole('button', { name: 'История чатов' }));
    const drawer = await screen.findByRole('dialog', { name: 'История чатов' });
    await user.click(
      await within(drawer).findByRole(
        'button',
        { name: 'Удалить чат «Что мне сделать сегодня?»' },
        WAIT,
      ),
    );
    const confirm = await screen.findByRole('dialog', { name: 'Удалить чат?' });
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/student/tutor'), WAIT);
    await waitFor(() =>
      expect(within(drawer).queryByText('Что мне сделать сегодня?')).not.toBeInTheDocument(),
    );
  });
});
