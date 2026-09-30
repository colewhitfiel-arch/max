/**
 * `/auth/role`: при первом входе (ролей нет) сверху — «Демонстрационный режим»; в режиме
 * «Добавить роль» (из настроек) кнопки нет.
 */
import type { MeDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useDemoTourStore } from '@/features/demo-tour';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { RoleSetupPage } from './RoleSetupPage';

function me(roles: MeDto['roles']): MeDto {
  return {
    user: { id: 'u1', firstName: 'Новый', lastName: null, nickname: null, avatarUrl: null },
    roles,
    activeRole: roles[0] ?? null,
    needsRoleSetup: roles.length === 0,
    student: null,
    parent: null,
    teacher: null,
    settings: { theme: 'SYSTEM', locale: 'ru', notifications: {} },
  } as unknown as MeDto;
}

function renderPage(roles: MeDto['roles']) {
  useAuthStore.setState({ status: 'authenticated', me: me(roles) });
  return render(
    <MemoryRouter initialEntries={['/auth/role']}>
      <RoleSetupPage />
    </MemoryRouter>,
  );
}

describe('RoleSetupPage', () => {
  afterEach(() => {
    resetAuthStore();
    useDemoTourStore.getState().stop();
  });

  it('первый вход: «Демонстрационный режим» над ролями запускает тур', async () => {
    const user = userEvent.setup();
    renderPage([]);
    const demo = screen.getByRole('button', { name: 'Демонстрационный режим' });
    const student = screen.getByRole('button', { name: /^Я ученик/ });
    // Кнопка — выше списка ролей.
    expect(demo.compareDocumentPosition(student) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(demo);
    expect(useDemoTourStore.getState()).toMatchObject({ active: true, index: 0 });
  });

  it('«Добавить роль» (роли уже есть) — без демонстрационного режима', () => {
    renderPage(['STUDENT']);
    expect(screen.queryByRole('button', { name: 'Демонстрационный режим' })).toBeNull();
  });
});
