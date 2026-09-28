/**
 * Профиль репетитора: фото и имя, «Преподаватель · N групп · M учеников», плитки статистики
 * и «Мои группы» (→ группа) — из `GET /teacher/home`; загрузка, ошибка, нет групп.
 */
import { type MeDto, type TeacherHomeDto, TeacherHomeDtoSchema } from '@edu/contracts';
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
import { TeacherProfilePage } from './TeacherProfilePage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const teacher = {
  id: id(20),
  user: { id: id(10), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const ROBOTICS = id(201);
const PYTHON = id(202);

const maria: MeDto = {
  user: teacher.user,
  roles: ['TEACHER'],
  activeRole: 'TEACHER',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: null,
  teacher: { id: teacher.id, schoolId: id(1) },
};

const groupCard = (
  groupId: string,
  title: string,
  code: string | null,
  club: string,
  studentsCount: number,
  needsAttentionCount: number,
) => ({
  id: groupId,
  title,
  code,
  club: { id: id(100), title: club, category: 'OTHER', coverUrl: null },
  teacher,
  studentsCount,
  attendanceRate: 0.92,
  completionRate: 0.4,
  needsAttentionCount,
  nextLesson: null,
});

function teacherHome(groups: ReturnType<typeof groupCard>[]): TeacherHomeDto {
  return TeacherHomeDtoSchema.parse({
    today: [],
    upcoming: [],
    groups,
    toGrade: [],
    events: [],
    stats: {
      groupsCount: groups.length,
      studentsCount: groups.reduce((sum, group) => sum + group.studentsCount, 0),
      avgAttendanceRate: groups.length ? 0.92 : null,
      avgCompletionRate: groups.length ? 0.4 : null,
      needsAttentionCount: groups.reduce((sum, group) => sum + group.needsAttentionCount, 0),
    },
  });
}

const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({ home: null as unknown }));
vi.mock('@/entities/dashboard', () => ({ useTeacherHome: () => hooks.home }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderProfile() {
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
          <MemoryRouter initialEntries={['/teacher/profile']}>
            <Routes>
              <Route path="/teacher/profile" element={<TeacherProfilePage />} />
              <Route path="/teacher/groups/:groupId" element={<p>группа</p>} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
}

describe('TeacherProfilePage', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', me: maria });
    hooks.home = ready(
      teacherHome([
        groupCard(ROBOTICS, 'Робототехника, группа А', '001', 'Робототехника', 2, 1),
        groupCard(PYTHON, 'Python, группа А', null, 'Программирование', 1, 0),
      ]),
    );
  });
  afterEach(() => resetAuthStore());

  it('шапка, плитки статистики и «Мои группы»; группа открывается по тапу', async () => {
    const user = userEvent.setup();
    renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getByText('Мария Иванова')).toBeInTheDocument();
    expect(screen.getByText('Преподаватель · 2 группы · 3 ученика')).toBeInTheDocument();
    // Смены фото нет, пока PUT /me/avatar не реализован (501).
    expect(screen.queryByLabelText('Выбрать фото профиля')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сменить фото' })).not.toBeInTheDocument();

    const stats = screen.getByRole('region', { name: 'Статистика' });
    for (const [label, value] of [
      ['Группы', '2'],
      ['Ученики', '3'],
      // Формат процента зависит от shared/lib/format (с неразрывным пробелом или без).
      ['Посещаемость', /^92\s?%$/],
      ['Требуют внимания', '1'],
    ] as const) {
      expect(within(stats).getByText(label)).toBeInTheDocument();
      expect(within(stats).getAllByText(value).length).toBeGreaterThan(0);
    }

    const groups = screen.getByRole('region', { name: 'Мои группы' });
    const robotics = within(groups).getByRole('button', { name: /Робототехника/ });
    expect(robotics).toHaveTextContent(/Группа 001 · 2 ученика · 92\s?%/);
    expect(within(robotics).getByTitle('Требуют внимания: 1')).toHaveTextContent('1');
    // Без кода группы — её название.
    expect(within(groups).getByRole('button', { name: /Программирование/ })).toHaveTextContent(
      /Python, группа А · 1 ученик · 92\s?%/,
    );

    await user.click(robotics);
    expect(screen.getByTestId('location')).toHaveTextContent(`/teacher/groups/${ROBOTICS}`);
  });

  it('нет групп — пустое состояние, статистика нулевая', () => {
    hooks.home = ready(teacherHome([]));
    renderProfile();

    expect(screen.getByText('Преподаватель · 0 групп · 0 учеников')).toBeInTheDocument();
    const groups = screen.getByRole('region', { name: 'Мои группы' });
    expect(within(groups).getByText('Групп пока нет')).toBeInTheDocument();
    expect(within(groups).queryByRole('button')).not.toBeInTheDocument();
  });

  it('загрузка — только роль и скелет; ошибка — «Повторить» перезапрашивает', async () => {
    const user = userEvent.setup();
    hooks.home = {
      data: undefined,
      error: null,
      isPending: true,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    };
    const { container, unmount } = renderProfile();
    expect(screen.getByText('Преподаватель')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Мои группы' })).not.toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    hooks.home = {
      data: undefined,
      error: new Error('сеть'),
      isPending: false,
      isError: true,
      isSuccess: false,
      refetch,
    };
    renderProfile();
    expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalled();
  });
});
