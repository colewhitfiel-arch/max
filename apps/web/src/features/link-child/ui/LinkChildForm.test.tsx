/**
 * Привязка по коду на MSW-моках: неизвестный код и уже привязанный ребёнок — понятные тексты
 * под полем (а не «раздел в разработке»); правка кода убирает прежнюю ошибку.
 */
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from '@/shared/api/mocks/handlers';
import { db, resetMockDb } from '@/shared/api/mocks/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { LinkChildForm } from './LinkChildForm';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

function renderForm() {
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <I18nextProvider i18n={i18n}>
          <LinkChildForm />
        </I18nextProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('LinkChildForm', () => {
  it('неизвестный код — «Код не найден», правка кода убирает ошибку', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByRole('textbox', { name: /Код из профиля ребёнка/ });
    await user.type(input, 'NOSUCH1');
    await user.click(screen.getByRole('button', { name: 'Привязать' }));

    expect(
      await screen.findByText('Код не найден. Проверь код в профиле ребёнка', {}, WAIT),
    ).toBeVisible();
    expect(screen.queryByText('Раздел в разработке')).toBeNull();

    await user.type(input, 'X');
    await waitFor(() =>
      expect(screen.queryByText('Код не найден. Проверь код в профиле ребёнка')).toBeNull(),
    );
  });

  it('уже привязанный ребёнок — «Ребёнок уже привязан»', async () => {
    // Ольга (max-parent-1) уже привязана к Алексею.
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const alexey = db.students.find((s) => s.id === DEMO_IDS.students.alexey);
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByRole('textbox', { name: /Код из профиля ребёнка/ }),
      alexey!.linkCode,
    );
    await user.click(screen.getByRole('button', { name: 'Привязать' }));

    expect(await screen.findByText('Ребёнок уже привязан', {}, WAIT)).toBeVisible();
  });
});
