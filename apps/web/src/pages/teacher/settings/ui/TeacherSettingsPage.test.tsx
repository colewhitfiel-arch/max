/**
 * Настройки репетитора: профиль, «Работа» (разделы вне нижнего меню), внешний вид (только тема),
 * роль и выход — на месте бывшего экрана «Ещё». Уведомлений, языка и подписи о приложении нет.
 */
import type { MeDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/shared/api/query-keys';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { TeacherSettingsPage } from './TeacherSettingsPage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const maria: MeDto = {
  user: { id: id(10), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  roles: ['TEACHER', 'PARENT'],
  activeRole: 'TEACHER',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: { id: id(30), childrenCount: 0 },
  teacher: { id: id(20), schoolId: id(1), subjects: ['ROBOTICS'], qualification: null },
};

// Раздел уведомлений у преподавателя убран: если экран снова его подключит, тест это увидит.
vi.mock('@/widgets/notification-settings', () => ({
  NotificationSettings: ({ role }: { role: string }) => <p>уведомления {role}</p>,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </output>
  );
}

function renderSettings() {
  // Колокольчик шапки читает непрочитанные из кэша — без сети.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData([...queryKeys.notifications, 'list', { unreadOnly: true }], {
    items: [],
    unreadCount: 0,
  });
  return render(
    <MaxBridgeProvider bridge={new MockMaxBridge({ launchParams: null })}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/teacher/settings']}>
            <Routes>
              <Route path="/teacher/settings" element={<TeacherSettingsPage />} />
              <Route path="*" element={<p>раздел</p>} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
}

describe('TeacherSettingsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', me: maria });
  });
  afterEach(() => resetAuthStore());

  it('секции: профиль, «Работа», внешний вид, аккаунт, выход', () => {
    renderSettings();

    expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeInTheDocument();
    expect(screen.getByText('Мария Иванова')).toBeInTheDocument();
    for (const title of ['Работа', 'Внешний вид', 'Аккаунт']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole('radiogroup', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти из аккаунта' })).toBeInTheDocument();
  });

  it('без уведомлений, языка и подписи «Мини-приложение «Кружки»»', () => {
    renderSettings();

    expect(screen.queryByText(/^уведомления/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Уведомления' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Язык/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Мини-приложение/)).not.toBeInTheDocument();
  });

  it.each([
    ['Кошелёк', '/teacher/wallet', { fromApp: true }],
    ['Группы', '/teacher/groups', null],
    ['Курсы', '/teacher/courses', null],
    // Конструктор курса больше не отдельный пункт настроек: он открывается кнопкой
    // «Задать ДЗ» на экране заданий — единственной точкой входа.
    ['Спрос на кружки', '/teacher/clubs/demand', null],
  ])('«Работа» → %s ведёт на %s', async (title, path, state) => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }));
    const location = screen.getByTestId('location');
    expect(location).toHaveTextContent(path);
    expect(location).toHaveAttribute('data-state', JSON.stringify(state));
  });

  it('карточка профиля ведёт в профиль', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Открыть профиль' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/profile');
  });

  it('«Роль»: текущая — преподаватель, в шторке можно выбрать родителя', async () => {
    const user = userEvent.setup();
    renderSettings();

    const role = screen.getByRole('button', { name: /^Роль/ });
    expect(role).toHaveTextContent('Преподаватель');
    await user.click(role);

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Родитель' })).toBeInTheDocument();
    expect(
      within(sheet).getByText('Преподаватель').closest('[aria-current="true"]'),
    ).not.toBeNull();
  });
});
