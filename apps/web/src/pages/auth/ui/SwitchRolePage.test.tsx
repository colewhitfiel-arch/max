/**
 * `/auth/switch`: с одной ролью экран не тупик — под списком «Добавить роль» ведёт на
 * `/auth/role`; когда добавлять нечего (есть все роли из `/auth/role`), кнопки нет.
 */
import type { MeDto, Role } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { canAddRole } from '../model';
import { SwitchRolePage } from './SwitchRolePage';

function meWith(roles: Role[], activeRole: Role): MeDto {
  return {
    user: {
      id: '0190a000-0000-7000-8000-000000000010',
      firstName: 'Мария',
      lastName: 'Иванова',
      nickname: null,
      avatarUrl: null,
    },
    roles,
    activeRole,
    needsRoleSetup: false,
    settings: { theme: 'SYSTEM', locale: 'ru' },
    student: null,
    parent: null,
    teacher: null,
  };
}

function renderPage(me: MeDto) {
  useAuthStore.setState({ status: 'authenticated', me });
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/auth/switch']}>
        <Routes>
          <Route path="/auth/switch" element={<SwitchRolePage />} />
          <Route path="/auth/role" element={<p>добавление роли</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('SwitchRolePage', () => {
  afterEach(() => {
    resetAuthStore();
  });

  it('одна роль — «Добавить роль» под списком ведёт на /auth/role', async () => {
    const user = userEvent.setup();
    renderPage(meWith(['STUDENT'], 'STUDENT'));
    expect(screen.getByText('Активная')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить роль' }));
    expect(await screen.findByText('добавление роли')).toBeInTheDocument();
  });

  it('все роли из /auth/role уже есть — кнопки нет', () => {
    renderPage(meWith(['STUDENT', 'PARENT', 'TEACHER'], 'PARENT'));
    expect(screen.queryByRole('button', { name: 'Добавить роль' })).not.toBeInTheDocument();
  });

  it('canAddRole: администратору школы доступны ученик, родитель и преподаватель', () => {
    expect(canAddRole(['SCHOOL_ADMIN'])).toBe(true);
    expect(canAddRole(['SCHOOL_ADMIN', 'STUDENT', 'PARENT', 'TEACHER'])).toBe(false);
  });
});
