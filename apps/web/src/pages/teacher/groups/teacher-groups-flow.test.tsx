/**
 * Режим репетитора на MSW-моках (F19): новый преподаватель сам отмечает, что ведёт; создаёт
 * группу по любому из 8 кружков и сразу получает ссылку-приглашение; ссылку можно сбросить.
 */
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, call } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { TEACHER_SUBJECTS_SETUP_STATE } from '@/shared/lib/teacher-paths';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { handlers } from '@/test/fake-api/handlers';
import { resetMockDb } from '@/test/fake-api/state';
import { TeacherSubjectsPage } from '../profile/ui/TeacherSubjectsPage';
import { CreateGroupPage } from './ui/CreateGroupPage';
import { GroupPage } from './ui/GroupPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

function renderAt(path: string, state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/teacher', element: <p>Главная репетитора</p> },
      { path: '/teacher/profile', element: <p>Профиль</p> },
      { path: '/teacher/profile/subjects', element: <TeacherSubjectsPage /> },
      { path: '/teacher/groups', element: <p>Группы</p> },
      { path: '/teacher/groups/new', element: <CreateGroupPage /> },
      { path: '/teacher/groups/:groupId', element: <GroupPage /> },
    ],
    { initialEntries: [{ pathname: path, state }] },
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

const clubRow = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('«Что вы ведёте?»', () => {
  it('новый преподаватель отмечает любые кружки и попадает на главную', async () => {
    await useAuthStore.getState().loginDev('max-teacher-fresh', ['TEACHER']);
    const user = userEvent.setup();
    const router = renderAt('/teacher/profile/subjects', TEACHER_SUBJECTS_SETUP_STATE);

    // Все 8 кружков, ничего не выбрано; без выбора сохранить нельзя.
    const list = await screen.findByRole('group', { name: 'Кружки' }, WAIT);
    expect(within(list).getAllByRole('button')).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Выберите хотя бы один кружок');

    await user.click(clubRow('Шахматы'));
    await user.click(clubRow('Китайский язык'));
    await user.click(clubRow('Ораторское мастерство'));
    await user.click(clubRow('Ораторское мастерство')); // передумал
    expect(clubRow('Шахматы')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Выбрано 2 кружка')).toBeVisible();
    await user.type(screen.getByLabelText('О себе'), 'Мастер ФИДЕ');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/teacher'), WAIT);
    const teacher = useAuthStore.getState().me?.teacher;
    expect(teacher?.subjects).toEqual(['CHINESE', 'CHESS']);
    expect(teacher?.qualification).toBe('Мастер ФИДЕ');
  });
});

describe('новая группа и ссылка', () => {
  it('группа по любому кружку → экран группы с открытой ссылкой; сброс даёт новую', async () => {
    // Мария ведёт робототехнику и Python, а группу заводит по китайскому.
    await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER']);
    const user = userEvent.setup();
    const router = renderAt('/teacher/groups/new');

    const list = await screen.findByRole('group', { name: 'Кружок' }, WAIT);
    const rows = within(list).getAllByRole('button');
    // Свои кружки — первыми, первый выбран сразу.
    expect(rows[0]).toHaveAccessibleName(/^Робототехника/);
    expect(rows[1]).toHaveAccessibleName(/^Программирование/);
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    await user.click(clubRow('Китайский язык'));
    expect(clubRow('Китайский язык')).toHaveAttribute('aria-pressed', 'true');
    expect(rows[0]).toHaveAttribute('aria-pressed', 'false');

    await user.type(screen.getByLabelText('Название группы'), 'Китайский, 5 класс');
    await user.type(screen.getByLabelText('Цена в месяц, ₽'), '1500');
    await user.click(screen.getByRole('button', { name: 'Добавить день' }));
    await user.click(screen.getByRole('button', { name: 'Создать группу' }));

    await waitFor(
      () => expect(router.state.location.pathname).toMatch(/^\/teacher\/groups\/[\w-]+$/),
      WAIT,
    );
    const sheet = await screen.findByRole('dialog', { name: 'Пригласить учеников' }, WAIT);
    const link = await within(sheet).findByLabelText('Ссылка на группу', {}, WAIT);
    expect((link as HTMLInputElement).value).toMatch(/\/join\/\w+$/);
    const first = (link as HTMLInputElement).value;

    await user.click(within(sheet).getByRole('button', { name: 'Сбросить ссылку' }));
    await waitFor(() => expect((link as HTMLInputElement).value).not.toBe(first), WAIT);

    // Группа создана как в API: кружок, цена, занятие по расписанию (пн 16:00–17:00).
    const groupId = router.state.location.pathname.split('/').pop()!;
    const group = await call(api.dashboards.getTeacherGroup({ params: { groupId } }));
    expect(group.title).toBe('Китайский, 5 класс');
    expect(group.club.category).toBe('CHINESE');
    expect(group.schedule).toEqual([
      expect.objectContaining({ weekday: 1, startTime: '16:00', endTime: '17:00' }),
    ]);
  });

  it('цена не числом — ошибка у поля, группа не создаётся', async () => {
    await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER']);
    const user = userEvent.setup();
    const router = renderAt('/teacher/groups/new');

    await user.type(await screen.findByLabelText('Цена в месяц, ₽', {}, WAIT), '15.5');
    await user.click(screen.getByRole('button', { name: 'Создать группу' }));
    expect(
      await screen.findByText('Цена — целое число рублей, не больше 1 000 000', {}, WAIT),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/teacher/groups/new');
  });
});
