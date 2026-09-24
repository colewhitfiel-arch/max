import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import '@/shared/i18n';
import { ScreenHeader } from './ScreenHeader';

function renderHeader(back: boolean | string) {
  const router = createMemoryRouter(
    [
      { path: '/teacher/groups', element: <div>groups</div> },
      { path: '/teacher/groups/g1', element: <ScreenHeader title="Группа" back={back} /> },
    ],
    { initialEntries: ['/teacher/groups', '/teacher/groups/g1'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ScreenHeader: назад', () => {
  it('back-строка заменяет экран на родительский (replace), а не добавляет запись', async () => {
    const router = renderHeader('/teacher/groups');
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(router.state.location.pathname).toBe('/teacher/groups');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('back=true — шаг по истории', async () => {
    const router = renderHeader(true);
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(router.state.location.pathname).toBe('/teacher/groups');
    expect(router.state.historyAction).toBe('POP');
  });
});
