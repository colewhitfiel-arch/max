/**
 * Чат с тьютором: ошибка стрима не «съедает» вопрос — пузырь «отправлено» убирается, текст
 * возвращается в поле (если ответ не начался), ошибка остаётся; лента не live-регион.
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
}));

vi.mock('@/shared/api/sse', () => ({
  useAiStream: () => ({
    ...hooks.state,
    isStreaming: hooks.state.status === 'streaming',
    start: async () => {
      hooks.state = hooks.result;
      return hooks.result;
    },
    abort: () => undefined,
    reset: () => {
      hooks.state = { status: 'idle', text: '', messageId: null, done: null, error: null };
    },
  }),
}));
vi.mock('@/entities/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AiEntity>()),
  useMessages: () => ({
    data: { items: [] },
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/shared/auth/hooks', () => ({ useMe: () => null }));

function renderChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TutorChat conversationId="0190a000-0000-7000-8000-000000000001" />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

describe('TutorChat', () => {
  beforeEach(() => {
    hooks.state = { ...IDLE };
  });

  it('ошибка до начала ответа: вопрос возвращается в поле, ошибка видна, лента перезапрошена', async () => {
    const user = userEvent.setup();
    hooks.result = {
      ...IDLE,
      status: 'error',
      error: new ApiClientError({ code: 'RATE_LIMITED', message: 'Лимит', status: 429 }),
    };
    const { container, invalidate } = renderChat();

    const input = screen.getByRole('textbox', { name: 'Напиши вопрос…' });
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
    hooks.result = { ...IDLE, status: 'done', text: 'Датчик измеряет расстояние.' };
    renderChat();

    await user.type(screen.getByRole('textbox', { name: 'Напиши вопрос…' }), 'Что такое датчик?');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Датчик измеряет расстояние.');
  });
});
