import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import '@/shared/i18n';
import { RoleShell } from './RoleShell';

function renderShell(initialEntries: string[]) {
  const router = createMemoryRouter(
    [
      {
        path: '/student',
        element: <RoleShell role="STUDENT" />,
        children: [
          { index: true, element: <div>home</div> },
          { path: 'tutor', element: <div>tutor</div> },
          { path: 'assignments', element: <div>assignments</div> },
          { path: 'assignments/:id', element: <div>assignment</div> },
        ],
      },
    ],
    { initialEntries, initialIndex: initialEntries.length - 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('RoleShell: нижнее меню', () => {
  it('повторный тап по открытому пункту не наращивает историю', async () => {
    const router = renderShell(['/student']);
    const keyBefore = router.state.location.key;
    await userEvent.click(screen.getByRole('button', { name: 'Главная' }));
    expect(router.state.location.key).toBe(keyBefore);
    expect(router.state.historyAction).toBe('POP');
  });

  it('с подэкрана активного раздела — replace на его корень, в другой раздел — push', async () => {
    const router = renderShell(['/student', '/student/assignments/a1']);
    await userEvent.click(screen.getByRole('button', { name: 'Задания' }));
    expect(router.state.location.pathname).toBe('/student/assignments');
    expect(router.state.historyAction).toBe('REPLACE');

    await userEvent.click(screen.getByRole('button', { name: 'ИИ-тьютор' }));
    expect(router.state.location.pathname).toBe('/student/tutor');
    expect(router.state.historyAction).toBe('PUSH');
  });
});
