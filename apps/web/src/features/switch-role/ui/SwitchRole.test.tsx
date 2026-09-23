/**
 * Смена роли: названия ролей — из i18n; после переключения — в корень, чтобы `RootRedirect`
 * сам отправил ученика без онбординга на `/onboarding`.
 */
import type { MeDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { SwitchRole } from './SwitchRole';

const me: MeDto = {
  user: {
    id: '0190a000-0000-7000-8000-000000000010',
    firstName: 'Мария',
    lastName: 'Иванова',
    nickname: null,
    avatarUrl: null,
  },
  roles: ['PARENT', 'STUDENT'],
  activeRole: 'PARENT',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: null,
  teacher: null,
};

const switchRole = vi.fn<(role: string) => Promise<MeDto>>();

function renderSwitch() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/auth/switch']}>
        <Routes>
          <Route path="/auth/switch" element={<SwitchRole />} />
          <Route path="/" element={<p>корень</p>} />
          <Route path="/student" element={<p>главная ученика</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('SwitchRole', () => {
  beforeEach(() => {
    switchRole.mockReset();
    switchRole.mockResolvedValue({ ...me, activeRole: 'STUDENT' });
    useAuthStore.setState({ status: 'authenticated', me, switchRole });
  });

  afterEach(() => {
    resetAuthStore();
  });

  it('переключение ведёт в корень, а не сразу на главную роли', async () => {
    const user = userEvent.setup();
    renderSwitch();

    expect(screen.getByRole('button', { name: /Ученик/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ученик/ }));

    expect(switchRole).toHaveBeenCalledWith('STUDENT');
    expect(await screen.findByText('корень')).toBeInTheDocument();
  });
});
