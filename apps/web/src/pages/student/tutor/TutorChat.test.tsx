/**
 * Чат с тьютором: ошибка стрима не «съедает» вопрос — пузырь «отправлено» убирается, текст
 * возвращается в поле (если ответ не начался), ошибка остаётся; лента не live-регион. «Стоп»
 * сбрасывает стрим до перезапроса ленты; «Показать раньше» подгружает старые сообщения.
 * Новый чат (`conversationId: null`) создаёт диалог первой отправкой и стримит уже в него.
 */
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AiEntity from '@/entities/ai';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { TutorChat } from './ui/TutorChat';

const IDLE = { status: 'idle', text: '', messageId: null, done: null, error: null };

const hooks = vi.hoisted(() => ({
  state: null as unknown as Record<string, unknown>,
  result: null as unknown as Record<string, unknown>,
  /** Порядок вызовов reset/invalidate — «Стоп» сбрасывает стрим до перезапроса ленты. */
  calls: [] as string[],
  messages: null as unknown as Record<string, unknown>,
  /** Пути стрима — в какой диалог ушёл вопрос. */
  paths: [] as string[],
  create: vi.fn<() => Promise<{ id: string }>>(),
}));

vi.mock('@/shared/api/sse', () => ({
  useAiStream: () => ({
    ...hooks.state,
    isStreaming: hooks.state.status === 'streaming',
    start: async (path: string) => {
      hooks.paths.push(path);
      hooks.state = hooks.result;
      return hooks.result;
    },
    abort: () => undefined,
    reset: () => {
      hooks.calls.push('reset');
      hooks.state = { status: 'idle', text: '', messageId: null, done: null, error: null };
    },
  }),
}));
vi.mock('@/entities/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AiEntity>()),
  useMessages: () => hooks.messages,
  useCreateConversation: () => ({ mutateAsync: hooks.create, isPending: false }),
}));
vi.mock('@/shared/auth/hooks', () => ({ useMe: () => null }));

const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000001';

function renderChat({
  conversationId = CONVERSATION_ID as string | null,
  onConversationCreated = vi.fn(),
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Перезапрос ленты — «invalidate»; истории чатов (заголовок, порядок) — «history».
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filters) => {
    hooks.calls.push(filters?.queryKey?.at(-1) === 'messages' ? 'invalidate' : 'history');
  });
  const prefetch = vi.spyOn(client, 'prefetchInfiniteQuery').mockImplementation(async () => {
    hooks.calls.push('prefetch');
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TutorChat conversationId={conversationId} onConversationCreated={onConversationCreated} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, invalidate, prefetch, onConversationCreated };
}

describe('TutorChat', () => {
  beforeEach(() => {
    hooks.state = { ...IDLE };
    hooks.calls = [];
    hooks.paths = [];
    hooks.create.mockReset();
    hooks.messages = {
      data: { items: [] },
      error: null,
      isPending: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    };
  });

  it('ошибка до начала ответа: вопрос возвращается в поле, ошибка видна, лента перезапрошена', async () => {
    const user = userEvent.setup();
    hooks.result = {
      ...IDLE,
      status: 'error',
      error: new ApiClientError({ code: 'RATE_LIMITED', message: 'Лимит', status: 429 }),
    };
    const { container, invalidate } = renderChat();

    const input = screen.getByRole('textbox', { name: 'Сообщение' });
    await user.type(input, 'Что такое датчик?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).toHaveValue('Что такое датчик?');
    // Пузырь «отправлено» убран — вопрос не висит как доставленный.
    expect(container.querySelector('[data-role="user"]')).toBeNull();
    expect(invalidate).toHaveBeenCalled();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('готовый ответ озвучивается один раз через status', async () => {
    const user = userEvent.setup();
    hooks.result = {
      ...IDLE,
      status: 'done',
      text: 'Датчик измеряет расстояние.',
      messageId: '0190a000-0000-7000-8000-000000000099',
    };
    renderChat();

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Что такое датчик?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Датчик измеряет расстояние.');
    // Готовый ответ: сначала лента с ним, потом сброс стрима — без мигания; затем история.
    expect(hooks.calls).toEqual(['invalidate', 'reset', 'history']);
  });

  it('«Стоп» до первого токена: стрим сброшен до перезапроса ленты, пустого ответа нет', async () => {
    const user = userEvent.setup();
    // Прерванный стрим завершается done без messageId.
    hooks.result = { ...IDLE, status: 'done' };
    const { container } = renderChat();

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Что такое датчик?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await vi.waitFor(() => expect(hooks.calls).toEqual(['reset', 'invalidate', 'history']));
    expect(container.querySelector('[data-role="assistant"]')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('«Показать раньше» подгружает старые сообщения', async () => {
    const user = userEvent.setup();
    hooks.messages = {
      ...hooks.messages,
      data: {
        items: [
          {
            id: '0190a000-0000-7000-8000-000000000011',
            role: 'USER',
            content: 'Привет',
            createdAt: '2026-09-22T09:00:00.000Z',
          },
        ],
      },
      hasNextPage: true,
    };
    renderChat();

    await user.click(screen.getByRole('button', { name: 'Показать раньше' }));
    expect(hooks.messages.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('новый чат: первая отправка создаёт диалог, стрим идёт в него, лента грузится заранее', async () => {
    const user = userEvent.setup();
    const createdId = '0190a000-0000-7000-8000-000000000042';
    hooks.create.mockResolvedValue({ id: createdId });
    hooks.result = {
      ...IDLE,
      status: 'done',
      text: 'Датчик измеряет расстояние.',
      messageId: '0190a000-0000-7000-8000-000000000099',
    };
    const { onConversationCreated } = renderChat({ conversationId: null });

    // Пустой новый чат — приветствие, без запроса ленты.
    expect(screen.getByText('Привет!')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Что такое датчик?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await vi.waitFor(() => expect(hooks.calls).toContain('history'));
    expect(hooks.create).toHaveBeenCalledTimes(1);
    expect(onConversationCreated).toHaveBeenCalledWith(createdId);
    expect(hooks.paths).toEqual([`/ai/conversations/${createdId}/messages`]);
    // Лента нового диалога загружается до переключения на неё — без скелета и дублей.
    expect(hooks.calls).toEqual(['invalidate', 'prefetch', 'reset', 'history']);
  });

  it('новый чат: диалог не создался — вопрос в поле, ошибка видна, стрима нет', async () => {
    const user = userEvent.setup();
    hooks.create.mockRejectedValue(
      new ApiClientError({ code: 'INTERNAL', message: 'Сервер недоступен', status: 500 }),
    );
    const { onConversationCreated } = renderChat({ conversationId: null });

    const input = screen.getByRole('textbox', { name: 'Сообщение' });
    await user.type(input, 'Что такое датчик?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).toHaveValue('Что такое датчик?');
    expect(onConversationCreated).not.toHaveBeenCalled();
    expect(hooks.paths).toEqual([]);
  });
});
