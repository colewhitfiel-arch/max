/**
 * Dev-вход: чекбоксы ролей — группа «Роли» (`Field group`), а не один id подписи на всех:
 * у каждого чекбокса свой id и доступное имя — название роли.
 */
import type { MeDto, Role } from '@edu/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { DevLoginForm } from './DevLoginForm';

const loginDev = vi.fn<(maxUserId: string, roles: Role[]) => Promise<MeDto>>();

describe('DevLoginForm', () => {
  beforeEach(() => {
    loginDev.mockReset();
    loginDev.mockResolvedValue({} as MeDto);
    useAuthStore.setState({ status: 'anonymous', error: null, me: null, loginDev });
  });

  afterEach(() => {
    resetAuthStore();
  });

  it('роли — группа «Роли»: у каждого чекбокса свой id и имя роли', () => {
    render(<DevLoginForm />);
    const group = screen.getByRole('group', { name: 'Роли' });
    const boxes = ['Ученик', 'Родитель', 'Преподаватель'].map((name) =>
      within(group).getByRole('checkbox', { name }),
    );
    expect(within(group).getAllByRole('checkbox')).toHaveLength(boxes.length);
    const ids = boxes.map((box) => box.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(boxes.length);
    // Подпись «Роли» ни к одному чекбоксу не привязана.
    expect(screen.queryByRole('checkbox', { name: /Роли/ })).not.toBeInTheDocument();
  });

  it('без ролей — ошибка описывает группу, вход недоступен', async () => {
    const user = userEvent.setup();
    render(<DevLoginForm />);
    await user.click(screen.getByRole('checkbox', { name: 'Ученик' }));
    const group = screen.getByRole('group', { name: 'Роли' });
    expect(group).toHaveAccessibleDescription('Нужна хотя бы одна роль');

    await user.type(screen.getByRole('textbox'), 'max-42');
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Родитель' }));
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(loginDev).toHaveBeenCalledWith('max-42', ['PARENT']);
  });
});
