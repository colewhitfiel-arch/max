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
import { delay, getResponse, http, HttpResponse } from 'msw';
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

  it('новый чат: пока после первого ответа грузится лента, второй вопрос не уходит; потом — уходит', async () => {
    // Как настоящий сервер: лента собирается в момент запроса, а отдаётся, когда тест откроет
    // ворота. Запрос ленты, пришедший раньше второго вопроса, второго вопроса не знает.
    let openFeed!: () => void;
    const feedGate = new Promise<void>((resolve) => {
      openFeed = resolve;
    });
    let feedRequests = 0;
    server.use(
      http.get(apiUrl('/ai/conversations/:conversationId/messages'), async ({ request }) => {
        feedRequests += 1;
        const response = await getResponse(handlers, request.clone());
        await feedGate;
        return response;
      }),
    );
    const user = userEvent.setup();
    renderTutor();
    await screen.findByText(/Привет, Алексей!/, {}, WAIT);
    const input = screen.getByRole('textbox', { name: 'Сообщение' });
    const sendButton = () => screen.getByRole('button', { name: 'Отправить' });

    await user.type(input, 'Первый вопрос');
    await user.click(sendButton());
    // Первый ответ дописан, лента нового чата запрошена и ещё не пришла.
    await screen.findByText(/покажу пример из твоего курса/, {}, WAIT);
    await waitFor(() => expect(feedRequests).toBe(1), WAIT);
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument(),
      WAIT,
    );

    // Промежуточное состояние: вопрос и ответ на месте, приветствия нет, поле занято —
    // набрать можно, отправить нельзя (ни кнопкой, ни Enter), остановить нечего.
    expect(screen.getByText('Первый вопрос')).toBeInTheDocument();
    expect(screen.queryByText(/Привет, Алексей!/)).not.toBeInTheDocument();
    await user.type(input, 'Второй вопрос');
    expect(sendButton()).toHaveAttribute('aria-busy', 'true');
    expect(sendButton()).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('Второй вопрос');
    expect(screen.getAllByRole('group', { name: 'Ты' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument();

    // Лента пришла — чат уже с сервера, поле свободно.
    openFeed();
    await waitFor(() => expect(sendButton()).not.toHaveAttribute('aria-busy'), WAIT);
    expect(sendButton()).toBeEnabled();
    expect(screen.getByText('Первый вопрос')).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Тьютор' })).toHaveLength(1);

    await user.click(sendButton());

    // В ленте оба вопроса и оба ответа — с сервера; приветствие пустого чата не вернулось.
    await waitFor(() => {
      expect(screen.getAllByRole('group', { name: 'Ты' })).toHaveLength(2);
      expect(screen.getAllByRole('group', { name: 'Тьютор' })).toHaveLength(2);
      expect(sendButton()).not.toHaveAttribute('aria-busy');
    }, WAIT);
    expect(screen.getByText('Первый вопрос')).toBeInTheDocument();
    expect(screen.getByText('Второй вопрос')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.queryByText(/Привет, Алексей!/)).not.toBeInTheDocument();
    expect(feedRequests).toBeGreaterThanOrEqual(2);
    // Два стрима — дольше стандартных 5 с.
  }, 20_000);

  it('новый чат: лента после первого ответа не загрузилась — поле освобождается, есть «Повторить»', async () => {
    // Поле занято, пока грузится лента нового чата; ошибка загрузки не должна держать его вечно.
    server.use(
      http.get(apiUrl('/ai/conversations/:conversationId/messages'), () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'Сбой', requestId: 'r-1' } },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderTutor();
    await screen.findByText(/Привет, Алексей!/, {}, WAIT);
    const sendButton = () => screen.getByRole('button', { name: 'Отправить' });

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Первый вопрос');
    await user.click(sendButton());
    await screen.findByText(/покажу пример из твоего курса/, {}, WAIT);

    await waitFor(() => expect(sendButton()).not.toHaveAttribute('aria-busy'), WAIT);
    expect(await screen.findByRole('button', { name: 'Повторить' }, WAIT)).toBeInTheDocument();
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
