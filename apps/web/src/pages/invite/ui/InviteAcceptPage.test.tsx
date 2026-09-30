/**
 * `/invite/:token` на MSW-моках: ученик принимает приглашение родителя; истёкшая, неизвестная
 * ссылка и открытие не из роли ученика — понятные сообщения.
 */
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, call } from '@/shared/api/client';
import { buildMe } from '@/test/fake-api/demo';
import { handlers } from '@/test/fake-api/handlers';
import { issueTokens } from '@/test/fake-api/lib';
import { createUser, db, resetMockDb } from '@/test/fake-api/state';
import { MOCK_INVITE_TOKENS } from '@/test/fake-api/world-extras';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { InviteAcceptPage } from './InviteAcceptPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

function renderInvite(token: string) {
  const router = createMemoryRouter(
    [
      { path: '/invite/:token', element: <InviteAcceptPage /> },
      // В приложении `/` — RootRedirect: онбординг ученика или главная роли.
      { path: '/', element: <p>Корень</p> },
      { path: '/student', element: <p>Главная ученика</p> },
      { path: '/parent', element: <p>Главная родителя</p> },
    ],
    { initialEntries: [`/invite/${token}`] },
  );
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

/** Приглашение Марии в моках принято этим учеником (как после его `accept`). */
function acceptInviteAs(studentId: string) {
  const invite = db.invites.find((i) => i.token === MOCK_INVITE_TOKENS.pending)!;
  invite.acceptedByStudentId = studentId;
  invite.acceptedAt = new Date().toISOString();
}

describe('InviteAcceptPage', () => {
  it('ученик подтверждает приглашение → связь ACTIVE и переход на главную', async () => {
    // Приглашение Марии в моках; Алексей его ещё не принимал.
    await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
    const user = userEvent.setup();
    const router = renderInvite(MOCK_INVITE_TOKENS.pending);

    expect(
      await screen.findByText('Мария Иванова хочет следить за твоими успехами', {}, WAIT),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(
      await screen.findByText('Готово! Теперь Мария Иванова видит твои успехи', {}, WAIT),
    ).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), WAIT);
    const invite = await call(
      api.family.getParentInvite({ params: { token: MOCK_INVITE_TOKENS.pending } }),
    );
    expect(invite.status).toBe('ACCEPTED');
  });

  it('ребёнок уже привязан к родителю — сразу «Ты уже привязан», без «Подтвердить»', async () => {
    // Даша (max-student-2) уже привязана к Марии — автору приглашения: сервер сообщает это
    // в самом приглашении (`alreadyLinked`), принимать нечего.
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    renderInvite(MOCK_INVITE_TOKENS.pending);

    expect(await screen.findByText('Ты уже привязан к этому родителю', {}, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();
    expect(screen.getByRole('button', { name: 'На главную' })).toBeEnabled();
  });

  it('привязали, пока экран был открыт (CONFLICT на «Подтвердить») — «Ты уже привязан»', async () => {
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    // Приглашение открыто до привязки: связи ещё нет, «Подтвердить» на экране.
    const link = db.links.find(
      (l) =>
        l.parentId === DEMO_IDS.parents.mariaAsParent && l.studentId === DEMO_IDS.students.dasha,
    )!;
    db.links.splice(db.links.indexOf(link), 1);
    const user = userEvent.setup();
    renderInvite(MOCK_INVITE_TOKENS.pending);

    const confirm = await screen.findByRole('button', { name: 'Подтвердить' }, WAIT);
    // …а пока экран открыт, ребёнка привязали по коду.
    db.links.push(link);
    await user.click(confirm);

    expect(await screen.findByText('Ты уже привязан к этому родителю', {}, WAIT)).toBeVisible();
    expect(screen.queryByText('Данные уже изменились, нужно обновить экран')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();
    expect(screen.getByRole('button', { name: 'На главную' })).toBeEnabled();
  });

  it('ссылку уже принял другой ученик — «Приглашение уже принято» и просьба о новой ссылке', async () => {
    // Приглашение Марии приняла Даша; Алексей к Марии не привязан.
    acceptInviteAs(DEMO_IDS.students.dasha);
    await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
    renderInvite(MOCK_INVITE_TOKENS.pending);

    expect(await screen.findByText('Приглашение уже принято', {}, WAIT)).toBeVisible();
    expect(
      screen.getByText('Ссылку уже использовали. Попроси родителя отправить новую ссылку в MAX'),
    ).toBeVisible();
    expect(screen.queryByText(/ничего делать не нужно/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();
  });

  it('другой ученик принял ссылку, пока экран был открыт (CONFLICT) — просьба о новой ссылке', async () => {
    await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
    const user = userEvent.setup();
    renderInvite(MOCK_INVITE_TOKENS.pending);

    const confirm = await screen.findByRole('button', { name: 'Подтвердить' }, WAIT);
    acceptInviteAs(DEMO_IDS.students.dasha);
    await user.click(confirm);

    expect(await screen.findByText('Приглашение уже принято', {}, WAIT)).toBeVisible();
    expect(
      screen.getByText('Ссылку уже использовали. Попроси родителя отправить новую ссылку в MAX'),
    ).toBeVisible();
    expect(screen.queryByText(/ничего делать не нужно/)).toBeNull();
  });

  it('своё принятое приглашение при живой связи — «ничего делать не нужно»', async () => {
    // Даша приняла приглашение Марии и привязана к ней.
    acceptInviteAs(DEMO_IDS.students.dasha);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    renderInvite(MOCK_INVITE_TOKENS.pending);

    expect(await screen.findByText('Приглашение уже принято', {}, WAIT)).toBeVisible();
    expect(
      screen.getByText('Связь с родителем уже подтверждена — ничего делать не нужно'),
    ).toBeVisible();
  });

  it('истёкшая и неизвестная ссылки — сообщение и «На главную»', async () => {
    await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
    renderInvite(MOCK_INVITE_TOKENS.expired);
    expect(await screen.findByText('Срок действия ссылки истёк', {}, WAIT)).toBeVisible();
    expect(screen.getByRole('button', { name: 'На главную' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();
  });

  it('неизвестный токен — «Приглашение не найдено»', async () => {
    await useAuthStore.getState().loginDev('max-student-1', ['STUDENT']);
    renderInvite('no-such-invite-token');
    expect(await screen.findByText('Приглашение не найдено', {}, WAIT)).toBeVisible();
  });

  it('новый пользователь без ролей: «Я ученик» → приглашение прямо здесь → принять', async () => {
    // Ребёнок впервые в приложении: вход прошёл, роли ещё нет (needsRoleSetup).
    const kid = createUser('max-new-kid', []);
    useAuthStore.setState({
      status: 'authenticated',
      ...issueTokens(kid.id, null),
      me: buildMe(kid, null),
      error: null,
    });
    const user = userEvent.setup();
    const router = renderInvite(MOCK_INVITE_TOKENS.pending);

    expect(await screen.findByText('Это приглашение для ученика', {}, WAIT)).toBeVisible();
    expect(screen.queryByText('Откройте ссылку в аккаунте ребёнка')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Я ученик/ }));

    expect(
      await screen.findByText('Мария Иванова хочет следить за твоими успехами', {}, WAIT),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(`/invite/${MOCK_INVITE_TOKENS.pending}`);
    expect(useAuthStore.getState().me?.activeRole).toBe('STUDENT');

    await user.click(screen.getByRole('button', { name: 'Подтвердить' }));
    // Дальше `/`: онбординг ещё не пройден — RootRedirect поведёт на него.
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), WAIT);
    expect(useAuthStore.getState().me?.student?.onboardingCompleted).toBe(false);
  });

  it('открыто из роли родителя — подсказка открыть в аккаунте ребёнка', async () => {
    await useAuthStore.getState().loginDev('max-parent-1', ['PARENT']);
    const user = userEvent.setup();
    const router = renderInvite(MOCK_INVITE_TOKENS.pending);

    expect(await screen.findByText('Откройте ссылку в аккаунте ребёнка', {}, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Перейти в режим ученика' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'На главную' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent'), WAIT);
  });
});
