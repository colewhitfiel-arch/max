/**
 * Настройки ученика: без уведомлений, выбора языка и подписи «Мини-приложение…»; «Поддержка»
 * открывает чат поддержки в MAX через мост (внутри MAX — `openMaxLink`), а если чат не настроен —
 * говорит об этом, а не уводит на чужую ссылку.
 */
import type { MeDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/shared/api/query-keys';
import type * as ConfigModule from '@/shared/config';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { SettingsPage } from './ui/SettingsPage';

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

const alexey: MeDto = {
  user: { id: id(11), firstName: 'Алексей', lastName: 'Смирнов', nickname: null, avatarUrl: null },
  roles: ['STUDENT'],
  activeRole: 'STUDENT',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: {
    id: id(21),
    onboardingCompleted: true,
    schoolId: id(1),
    linkCode: 'ABC123',
    classLabel: null,
  },
  parent: null,
  teacher: null,
};

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // Колокольчик шапки читает непрочитанные из кэша — без сети.
  client.setQueryData([...queryKeys.notifications, 'list', { unreadOnly: true }], {
    items: [],
    unreadCount: 0,
  });
  const bridge = new MockMaxBridge({ launchParams: null });
  const openLink = vi.spyOn(bridge, 'openLink').mockImplementation(() => undefined);
  render(
    <MaxBridgeProvider bridge={bridge}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/student/settings']}>
            <SettingsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
  return { openLink };
}

describe('SettingsPage (ученик)', () => {
  beforeEach(() => {
    hooks.supportUrl = 'https://max.ru/edu_support_test';
    useAuthStore.setState({ status: 'authenticated', me: alexey });
  });
  afterEach(() => resetAuthStore());

  it('нет уведомлений, языка и подписи о приложении; тема, роль, поддержка и выход — есть', () => {
    renderSettings();

    expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
    expect(screen.getByText('Тема')).toBeVisible();
    expect(screen.getByText('Поддержка')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Выйти из аккаунта' })).toBeVisible();

    expect(screen.queryByText('Уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Язык')).not.toBeInTheDocument();
    expect(screen.queryByText(/Мини-приложение/)).not.toBeInTheDocument();
  });

  it('«Поддержка» открывает чат поддержки в MAX', async () => {
    const user = userEvent.setup();
    const { openLink } = renderSettings();

    await user.click(screen.getByRole('button', { name: /Поддержка/ }));
    expect(openLink).toHaveBeenCalledWith('https://max.ru/edu_support_test');
  });

  it('чат поддержки не настроен — сообщение, никаких переходов', async () => {
    hooks.supportUrl = '';
    const user = userEvent.setup();
    const { openLink } = renderSettings();

    await user.click(screen.getByRole('button', { name: /Поддержка/ }));
    expect(openLink).not.toHaveBeenCalled();
    expect(await screen.findByText('Чат поддержки в MAX пока не подключён')).toBeVisible();
  });
});
