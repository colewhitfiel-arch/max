/**
 * Онбординг: провал старта — «Повторить» вместо тупика; ошибка стрима возвращает ответ
 * в поле ввода; «Остановить» до первого токена не добавляет пустой пузырь тьютора.
 */
import { ToastProvider } from '@edu/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AiEntity from '@/entities/ai';
import { ApiClientError } from '@/shared/api/errors';
import { resetAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { OnboardingPage } from './OnboardingPage';

type StartOptions = {
  onSuccess?: (result: { conversationId: string; message: unknown }) => void;
};

const hooks = vi.hoisted(() => ({
  start: {
    mutate: vi.fn<(vars: undefined, options?: StartOptions) => void>(),
    isError: false,
    error: null as unknown,
    isPending: false,
  },
  streamStart: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));

vi.mock('@/entities/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AiEntity>()),
  ChatMessage: ({ role, content }: { role: string; content: string }) => (
    <p data-testid="message" data-role={role}>
      {content}
    </p>
  ),
  useStartOnboarding: () => hooks.start,
  useCompleteOnboarding: () => ({ mutate: vi.fn(), isPending: false }),
  useOnboardingRecommendations: () => ({ data: undefined, isPending: true, isError: false }),
}));

vi.mock('@/shared/api/sse', () => ({
  useAiStream: () => ({
    status: 'idle',
    text: '',
    error: null,
    messageId: null,
    done: null,
    isStreaming: false,
    start: hooks.streamStart,
    abort: vi.fn(),
    reset: vi.fn(),
  }),
}));

const greeting = {
  id: '0190a000-0000-7000-8000-000000000001',
  conversationId: 'c1',
  role: 'ASSISTANT',
  content: 'Привет! Чем любишь заниматься?',
  createdAt: '2026-09-23T09:00:00.000Z',
};

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    // jsdom не реализует прокрутку — лента скроллится к последнему сообщению.
    Element.prototype.scrollIntoView = vi.fn();
    hooks.start.isError = false;
    hooks.start.error = null;
    hooks.start.mutate.mockReset();
    hooks.start.mutate.mockImplementation((_vars, options) =>
      options?.onSuccess?.({ conversationId: 'c1', message: greeting }),
    );
    hooks.streamStart.mockReset();
  });

  afterEach(() => {
    resetAuthStore();
  });

  it('провал старта: ошибка с «Повторить», повтор снова стартует диалог', async () => {
    hooks.start.mutate.mockImplementation(() => {});
    hooks.start.isError = true;
    hooks.start.error = new ApiClientError({ code: 'INTERNAL', message: 'x', status: 500 });
    const user = userEvent.setup();
    renderPage();

    expect(hooks.start.mutate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(hooks.start.mutate).toHaveBeenCalledTimes(2);
  });

  it('ошибка стрима: ответ ученика возвращается в поле ввода', async () => {
    hooks.streamStart.mockResolvedValue({ status: 'error', text: '', messageId: null });
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole('textbox', { name: 'Сообщение' });
    await user.type(input, 'Роботы');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(input).toHaveValue('Роботы'));
    expect(screen.queryByText('Роботы', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('«Остановить» до первого токена: ответ ученика в ленте, пустого пузыря нет', async () => {
    hooks.streamStart.mockResolvedValue({ status: 'done', text: '', messageId: null, done: null });
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole('textbox', { name: 'Сообщение' });
    await user.type(input, 'Роботы');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(screen.getByText('Роботы', { selector: 'p' })).toBeInTheDocument());
    const roles = screen.getAllByTestId('message').map((m) => m.dataset.role);
    expect(roles).toEqual(['ASSISTANT', 'USER']);
    expect(input).toHaveValue('');
  });
});
