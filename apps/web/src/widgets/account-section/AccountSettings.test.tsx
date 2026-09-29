/**
 * «Аккаунт» → «Поддержка»: у всех ролей (родитель и преподаватель рендерят `<AccountSettings />`
 * без пропсов) открывается чат поддержки из `VITE_SUPPORT_URL` через мост, а если он не настроен —
 * подсказка, без перехода на чужую ссылку.
 */
import type { MeDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '@/shared/config';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { resetDemoTour, useDemoTourStore } from '@/features/demo-tour/model/store';
import { AccountSettings } from './AccountSettings';

const hooks = vi.hoisted(() => ({ supportUrl: 'https://max.ru/edu_support_test' }));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof ConfigModule>();
  return {
    config: {
      ...actual.config,
      get supportUrl() {
        return hooks.supportUrl;
      },
    },
  };
});

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function meOf(role: 'PARENT' | 'TEACHER'): MeDto {
  return {
    user: { id: id(1), firstName: 'Ольга', lastName: 'Смирнова', nickname: null, avatarUrl: null },
    roles: [role],
    activeRole: role,
    needsRoleSetup: false,
    settings: { theme: 'SYSTEM', locale: 'ru' },
    student: null,
    parent: role === 'PARENT' ? { id: id(2), childrenCount: 1 } : null,
    teacher:
      role === 'TEACHER'
        ? { id: id(3), schoolId: id(4), subjects: ['ROBOTICS'], qualification: null }
        : null,
  };
}

function renderAccount() {
  const bridge = new MockMaxBridge({ launchParams: null });
  const openLink = vi.spyOn(bridge, 'openLink').mockImplementation(() => undefined);
  render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <MemoryRouter>
          <AccountSettings />
        </MemoryRouter>
      </ToastProvider>
    </MaxBridgeProvider>,
  );
  return { openLink };
}

describe('AccountSettings: поддержка', () => {
  beforeEach(() => {
    hooks.supportUrl = 'https://max.ru/edu_support_test';
  });
  afterEach(() => resetAuthStore());

  it.each(['PARENT', 'TEACHER'] as const)(
    '%s: открывает чат поддержки из VITE_SUPPORT_URL',
    async (role) => {
      useAuthStore.setState({ status: 'authenticated', me: meOf(role) });
      const user = userEvent.setup();
      const { openLink } = renderAccount();

      await user.click(screen.getByRole('button', { name: /Поддержка/ }));
      expect(openLink).toHaveBeenCalledWith('https://max.ru/edu_support_test');
    },
  );

  it.each(['PARENT', 'TEACHER'] as const)(
    '%s: чат не настроен — подсказка, никаких переходов',
    async (role) => {
      hooks.supportUrl = '';
      useAuthStore.setState({ status: 'authenticated', me: meOf(role) });
      const user = userEvent.setup();
      const { openLink } = renderAccount();

      await user.click(screen.getByRole('button', { name: /Поддержка/ }));
      expect(openLink).not.toHaveBeenCalled();
      expect(await screen.findByText('Чат поддержки в MAX пока не подключён')).toBeVisible();
    },
  );
});

describe('AccountSettings → «Демонстрационный режим» (F20)', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({ status: 'authenticated', me: meOf('TEACHER') });
  });
  afterEach(() => resetDemoTour());

  it('строка в настройках запускает тур — внутри MAX это единственный вход для аккаунта с ролью', async () => {
    renderAccount();
    expect(useDemoTourStore.getState().active).toBe(false);
    await userEvent.setup().click(screen.getByRole('button', { name: /Демонстрационный режим/ }));
    expect(useDemoTourStore.getState().active).toBe(true);
    expect(useDemoTourStore.getState().index).toBe(0);
  });
});
