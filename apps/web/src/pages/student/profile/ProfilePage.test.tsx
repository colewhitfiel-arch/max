import { StudentProfileDtoSchema, type StudentProfileDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import type * as SharedUi from '@/shared/ui';
import { ProfilePage } from './ui/ProfilePage';

const ROBOTICS = '0190a000-0000-7000-8000-0000000000a1';
const task = (n: number) => `0190a000-0000-7000-8000-00000000010${n}`;

const teacher = {
  id: '0190a000-0000-7000-8000-0000000000f1',
  user: {
    id: '0190a000-0000-7000-8000-0000000000f2',
    firstName: 'Мария',
    lastName: 'Иванова',
    nickname: null,
    avatarUrl: null,
  },
  photoUrl: null,
};
const robotics = {
  id: '0190a000-0000-7000-8000-0000000000c1',
  title: 'Робототехника',
  category: 'ROBOTICS' as const,
  coverUrl: null,
};
const roboticsGroup = { id: ROBOTICS, title: '001', club: robotics, teacher };

const profile: StudentProfileDto = StudentProfileDtoSchema.parse({
  user: {
    id: '0190a000-0000-7000-8000-0000000000e1',
    firstName: 'Алексей',
    lastName: 'Смирнов',
    nickname: null,
    avatarUrl: null,
  },
  classLabel: '5А',
  school: null,
  clubs: [],
  stats: {
    attendanceRate: 0.9,
    completionRate: 0.5,
    activityScore: 60,
    absences: 1,
    lateCount: 0,
    period: { from: '2026-08-25', to: '2026-09-23' },
  },
  interests: [],
  goals: [],
  streakDays: 3,
  points: 120,
  week: [
    { date: '2026-09-21', status: 'ATTENDED' },
    { date: '2026-09-22', status: 'MISSED' },
    { date: '2026-09-23', status: 'TODAY' },
    { date: '2026-09-24', status: 'UPCOMING' },
    { date: '2026-09-25', status: 'NO_LESSONS' },
    { date: '2026-09-26', status: 'NO_LESSONS' },
    { date: '2026-09-27', status: 'NO_LESSONS' },
  ],
  homework: { correct: 1, wrong: 1, upcoming: 1 },
  clubHomework: [
    {
      club: robotics,
      group: roboticsGroup,
      counts: { correct: 1, wrong: 1, upcoming: 1 },
      tasks: [
        {
          assignmentId: task(1),
          number: 1,
          title: 'Датчики',
          status: 'DONE',
          dueAt: '2026-09-10T15:00:00.000Z',
          scorePercent: 90,
        },
        {
          assignmentId: task(2),
          number: 2,
          title: 'Схема',
          status: 'FAILED',
          dueAt: '2026-09-15T15:00:00.000Z',
          scorePercent: 60,
        },
        {
          assignmentId: task(3),
          number: 3,
          title: 'Лабиринт',
          status: 'SOON',
          dueAt: '2026-09-24T15:00:00.000Z',
          scorePercent: null,
        },
      ],
    },
  ],
});

vi.mock('@/entities/dashboard', () => ({
  useStudentProfile: () => ({
    data: profile,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/shared/auth/hooks', () => ({
  useMe: () => ({ student: { linkCode: 'K7Q2MX' } }),
}));
// Траектория и колокольчик шапки ходят в сеть — здесь проверяем только «Успеваемость».
vi.mock('@/widgets/trajectory', () => ({ TrajectoryCard: () => null }));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedUi>()),
  ScreenHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MaxBridgeProvider bridge={new MockMaxBridge()}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/student/profile']}>
            <Routes>
              <Route path="/student/profile" element={<ProfilePage />} />
              <Route path="/student/assignments/:id" element={<p>Задание</p>} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
}

describe('ProfilePage', () => {
  it('показывает героя, «Успеваемость» по макету и код для родителя', () => {
    renderProfile();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Успеваемость' })).toBeInTheDocument();
    expect(screen.getByText('Посещения')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Домашние задачи: правильно 1, неправильно 1, предстоят 1',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Робототехника' })).toBeInTheDocument();
    expect(screen.getByText('K7Q2MX')).toBeInTheDocument();
  });

  it('«Подробнее» раскрывает сетку с порогом ученика, клетка открывает задание', async () => {
    const user = userEvent.setup();
    renderProfile();
    await user.click(screen.getByRole('button', { name: 'Подробнее' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/student/profile?club=${ROBOTICS}`);

    const grid = screen.getByRole('list', { name: /Задания по кружку «Робототехника»:/ });
    expect(
      within(grid).getByRole('button', { name: 'Задание 2 — правильно меньше 75%' }),
    ).toBeInTheDocument();

    await user.click(within(grid).getByRole('button', { name: /^Задание 3/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/student/assignments/${task(3)}`);
  });
});
