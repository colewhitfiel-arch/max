/**
 * `/parent/children` на MSW-моках: ссылка-приглашение и привязка по коду на одном экране.
 * Ребёнок, привязанный по коду, не выдаётся за принявшего приглашение (docs/07 F9, F14).
 */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { studentKeys } from '@/entities/student';
import { studentBrief } from '@/test/fake-api/demo';
import { handlers } from '@/test/fake-api/handlers';
import { apiUrl } from '@/test/fake-api/lib';
import { db, resetMockDb } from '@/test/fake-api/state';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { useUiStore } from '@/shared/store/ui-store';
import { ChildrenPage } from './ui/ChildrenPage';

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

function renderChildren() {
  const bridge = new MockMaxBridge({
    launchParams: null,
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  });
  const haptic = vi.spyOn(bridge, 'haptic').mockImplementation(() => {});
  const router = createMemoryRouter(
    [
      { path: '/parent/children', element: <ChildrenPage /> },
      { path: '/parent', element: <p>Главная родителя</p> },
    ],
    { initialEntries: ['/parent/children'] },
  );
  render(
    <MaxBridgeProvider bridge={bridge}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <I18nextProvider i18n={i18n}>
            <RouterProvider router={router} />
          </I18nextProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
  return { router, haptic };
}

describe('ChildrenPage', () => {
  it('ссылка на экране, ребёнка привязали по коду — «Ребёнок привязан», а не «принял приглашение»', async () => {
    // Мария-родитель: привязана Даша; Алексея привязываем по его коду.
    await useAuthStore.getState().loginDev('max-teacher-1', ['PARENT']);
    const user = userEvent.setup();
    const { router, haptic } = renderChildren();

    await screen.findByText('Даша Иванова', {}, WAIT);
    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    await screen.findByRole('textbox', { name: 'Ссылка-приглашение' }, WAIT);

    await user.type(screen.getByRole('textbox', { name: 'Код из профиля ребёнка' }), 'ALX123');
    await user.click(screen.getByRole('button', { name: 'Привязать' }));

    expect(await screen.findByText('Ребёнок привязан', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
    expect(screen.queryByText(/Ребёнок принял приглашение/)).toBeNull();
    expect(haptic).not.toHaveBeenCalledWith('success');
  });

  it('список детей перечитался, пока ответ на привязку по коду в пути, — не «принял приглашение»', async () => {
    await useAuthStore.getState().loginDev('max-teacher-1', ['PARENT']);
    // Сервер уже привязал Алексея по коду, а ответ на POST /parent/children/link ещё не пришёл.
    let linked!: () => void;
    const linkedOnServer = new Promise<void>((resolve) => (linked = resolve));
    let respond!: () => void;
    const gate = new Promise<void>((resolve) => (respond = resolve));
    server.use(
      http.post(apiUrl('/parent/children/link'), async () => {
        const now = new Date().toISOString();
        db.links.push({
          parentId: DEMO_IDS.parents.mariaAsParent,
          studentId: DEMO_IDS.students.alexey,
          status: 'ACTIVE',
          requestedAt: now,
          confirmedAt: now,
        });
        linked();
        await gate;
        return HttpResponse.json({
          student: studentBrief(DEMO_IDS.students.alexey),
          linkStatus: 'ACTIVE',
        });
      }),
    );
    const user = userEvent.setup();
    const { haptic } = renderChildren();

    await screen.findByText('Даша Иванова', {}, WAIT);
    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    await screen.findByRole('textbox', { name: 'Ссылка-приглашение' }, WAIT);
    await user.type(screen.getByRole('textbox', { name: 'Код из профиля ребёнка' }), 'ALX123');
    await user.click(screen.getByRole('button', { name: 'Привязать' }));
    await linkedOnServer;

    // Опрос раз в 5 с (или другая инвалидация) перечитал детей: Алексей уже ACTIVE, но кого
    // привязали по коду, ещё неизвестно — это не принятие ссылки.
    await queryClient.invalidateQueries({ queryKey: studentKeys.children() });
    expect(await screen.findByText('Алексей Смирнов', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/Ребёнок принял приглашение/)).toBeNull();
    expect(haptic).not.toHaveBeenCalledWith('success');

    respond();
    expect(await screen.findByText('Ребёнок привязан', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/Ребёнок принял приглашение/)).toBeNull();
    expect(haptic).not.toHaveBeenCalledWith('success');
  });

  it('ребёнок принял ссылку — тост «Ребёнок принял приглашение» и новая ссылка', async () => {
    await useAuthStore.getState().loginDev('max-teacher-1', ['PARENT']);
    const user = userEvent.setup();
    const { haptic } = renderChildren();

    await screen.findByText('Даша Иванова', {}, WAIT);
    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    await screen.findByRole('textbox', { name: 'Ссылка-приглашение' }, WAIT);

    // Алексей принял приглашение Марии; список детей перечитался (как по опросу раз в 5 с).
    const now = new Date().toISOString();
    db.links.push({
      parentId: DEMO_IDS.parents.mariaAsParent,
      studentId: DEMO_IDS.students.alexey,
      status: 'ACTIVE',
      requestedAt: now,
      confirmedAt: now,
    });
    await queryClient.invalidateQueries({ queryKey: studentKeys.children() });

    expect(
      await screen.findByText('Ребёнок принял приглашение: Алексей Смирнов', {}, WAIT),
    ).toBeInTheDocument();
    expect(haptic).toHaveBeenCalledWith('success');
    expect(await screen.findByRole('button', { name: 'Создать ссылку' }, WAIT)).toBeEnabled();
  });
});
