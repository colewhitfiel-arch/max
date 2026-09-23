/**
 * Чат родителя с тьютором — как у ученика: ошибка стрима не «съедает» вопрос (пузырь убран,
 * текст вернулся в поле, ошибка видна), «Стоп» до первого токена не рисует пустой ответ и
 * сбрасывает стрим до перезапроса ленты.
 */
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AiEntity from '@/entities/ai';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { ParentTutorChat } from './ui/ParentTutorChat';

const IDLE = { status: 'idle', text: '', messageId: null, done: null, error: null };

const hooks = vi.hoisted(() => ({
  state: null as unknown as Record<string, unknown>,
  result: null as unknown as Record<string, unknown>,
  calls: [] as string[],
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
      hooks.calls.push('reset');
      hooks.state = { status: 'idle', text: '', messageId: null, done: null, error: null };
    },
  }),
}));
vi.mock('@/entities/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AiEntity>()),
  useParentMessages: () => ({
    data: { items: [] },
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock('@/shared/auth/hooks', () => ({ useMe: () => null }));

function renderChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(async () => {
    hooks.calls.push('invalidate');
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ParentTutorChat conversationId="0190a000-0000-7000-8000-000000000002" childName="Даша" />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

async function ask(text: string) {
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'Сообщение' });
  await user.type(input, text);
  await user.click(screen.getByRole('button', { name: 'Отправить' }));
  return input;
}

describe('ParentTutorChat', () => {
  beforeEach(() => {
    hooks.state = { ...IDLE };
    hooks.calls = [];
  });

  it('ошибка до начала ответа: вопрос возвращается в поле, ошибка видна, лента перезапрошена', async () => {
    hooks.result = {
      ...IDLE,
      status: 'error',
      error: new ApiClientError({ code: 'RATE_LIMITED', message: 'Лимит', status: 429 }),
    };
    const { container, invalidate } = renderChat();

    const input = await ask('Как Даша занимается?');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).toHaveValue('Как Даша занимается?');
    expect(container.querySelector('[data-role="user"]')).toBeNull();
    expect(invalidate).toHaveBeenCalled();
  });

  it('«Стоп» до первого токена: стрим сброшен до перезапроса ленты, пустого ответа нет', async () => {
    hooks.result = { ...IDLE, status: 'done' };
    const { container } = renderChat();

    await ask('Как Даша занимается?');

    await vi.waitFor(() => expect(hooks.calls).toEqual(['reset', 'invalidate']));
    expect(container.querySelector('[data-role="assistant"]')).toBeNull();
  });
});
