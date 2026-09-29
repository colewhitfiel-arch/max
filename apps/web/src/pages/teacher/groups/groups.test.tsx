/**
 * Группы преподавателя: список (плюрализация «требует внимания», «Новая группа») и карточка
 * группы — пустые расписание/ученики, «Пригласить учеников» (ссылка), чужая группа (403) —
 * «Группа не найдена» с возвратом к списку.
 */
import { GroupDetailSchema, type GroupDetail } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { GroupPage } from './ui/GroupPage';
import { GroupsPage } from './ui/GroupsPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const GROUP_ID = id(0xa1);

const groupDetail: GroupDetail = GroupDetailSchema.parse({
  id: GROUP_ID,
  title: 'Робототехника, группа А',
  code: '001',
  club: { id: id(0xc1), title: 'Робототехника', category: 'ROBOTICS', coverUrl: null },
  teacher: {
    id: id(0xf1),
    user: {
      id: id(0xf2),
      firstName: 'Мария',
      lastName: 'Иванова',
      nickname: null,
      avatarUrl: null,
    },
    photoUrl: null,
  },
  studentsCount: 0,
  attendanceRate: null,
  completionRate: null,
  needsAttentionCount: 1,
  nextLesson: null,
  schedule: [],
  students: [],
});

const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});

const failed = (error: unknown) => ({
  data: undefined,
  error,
  isPending: false,
  isError: true,
  isSuccess: false,
  refetch: vi.fn(),
});

const INVITE_URL = 'http://localhost/join/robotics-token-0001';

const hooks = vi.hoisted(() => ({
  groups: null as unknown,
  group: null as unknown,
  lessons: null as unknown,
  invite: null as unknown,
  /** С каким `enabled` запрошена ссылка: шторка грузит её только открытой. */
  inviteEnabled: [] as boolean[],
}));

vi.mock('@/entities/group', () => ({
  useTeacherGroups: () => hooks.groups,
  useTeacherGroup: () => hooks.group,
  useGroupInvite: (_groupId: string, enabled: boolean) => {
    hooks.inviteEnabled.push(enabled);
    return hooks.invite;
  },
  useResetGroupInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/entities/lesson', () => ({
  useTeacherLessons: () => hooks.lessons,
  LessonCard: () => null,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MaxBridgeProvider bridge={new MockMaxBridge({ launchParams: null })}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/teacher/groups" element={<GroupsPage />} />
              <Route path="/teacher/groups/new" element={<p>Новая группа</p>} />
              <Route path="/teacher/groups/:groupId" element={<GroupPage />} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
}

beforeEach(() => {
  hooks.groups = ready({ items: [groupDetail] });
  hooks.group = ready(groupDetail);
  hooks.lessons = ready({ lessons: [] });
  hooks.invite = ready({ token: 'robotics-token-0001', url: INVITE_URL });
  hooks.inviteEnabled = [];
});

describe('GroupsPage', () => {
  it('«требует внимания» согласуется с числом', () => {
    renderAt('/teacher/groups');
    expect(screen.getByText('1 требует внимания')).toBeInTheDocument();
  });

  it('«Новая группа» ведёт на форму; без групп — она же в пустом состоянии', async () => {
    const user = userEvent.setup();
    hooks.groups = ready({ items: [] });
    renderAt('/teacher/groups');
    expect(screen.getByText('Групп пока нет')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Новая группа' }));
    expect(screen.getByTestId('location').textContent).toBe('/teacher/groups/new');
  });
});

describe('GroupPage', () => {
  it('пустые расписание и список учеников — пустые состояния', () => {
    renderAt(`/teacher/groups/${GROUP_ID}`);
    expect(screen.getByText('Расписание не задано')).toBeInTheDocument();
    expect(screen.getByText('В группе пока нет учеников')).toBeInTheDocument();
  });

  it('«Пригласить учеников» открывает ссылку группы; закрытая шторка ссылку не грузит', async () => {
    const user = userEvent.setup();
    renderAt(`/teacher/groups/${GROUP_ID}`);
    expect(hooks.inviteEnabled.every((enabled) => !enabled)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Пригласить учеников' }));
    const sheet = screen.getByRole('dialog', { name: 'Пригласить учеников' });
    expect(within(sheet).getByLabelText('Ссылка на группу')).toHaveValue(INVITE_URL);
    expect(within(sheet).getByRole('button', { name: 'Сбросить ссылку' })).toBeInTheDocument();
    expect(hooks.inviteEnabled.at(-1)).toBe(true);
  });

  it('чужая группа (403) — «Группа не найдена» с возвратом к списку, без «Повторить»', async () => {
    const user = userEvent.setup();
    const forbidden = new ApiClientError({ code: 'FORBIDDEN', message: 'Нет', status: 403 });
    hooks.group = failed(forbidden);
    hooks.lessons = failed(forbidden);
    renderAt(`/teacher/groups/${GROUP_ID}`);

    expect(screen.getByText('Группа не найдена')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'К списку групп' }));
    expect(screen.getByTestId('location').textContent).toBe('/teacher/groups');
  });
});
