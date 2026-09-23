import {
  GroupDetailSchema,
  TeacherPerformanceDtoSchema,
  type GroupDetail,
  type TeacherPerformanceDto,
} from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GroupEntity from '@/entities/group';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { GroupStudentsPage } from './ui/GroupStudentsPage';
import { PerformancePage } from './ui/PerformancePage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const teacher = {
  id: id(0xf1),
  user: { id: id(0xf2), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const robotics = { id: id(0xc1), title: 'Робототехника', category: 'ROBOTICS', coverUrl: null };
const chinese = { id: id(0xc2), title: 'Китайский', category: 'LANGUAGES', coverUrl: null };
const chess = { id: id(0xc3), title: 'Шахматы', category: 'CHESS', coverUrl: null };

const ROBOTICS_A = id(0xa1);
const group = (groupId: string, code: string | null, title: string, club: typeof robotics) => ({
  id: groupId,
  title,
  code,
  club,
  teacher,
});

const performance: TeacherPerformanceDto = TeacherPerformanceDtoSchema.parse({
  period: 'day',
  from: '2026-09-23T00:00:00.000Z',
  to: '2026-09-23T12:00:00.000Z',
  groups: [
    {
      group: group(ROBOTICS_A, '001', 'Робототехника, группа А', robotics),
      studentsCount: 2,
      attended: 15,
      missed: 4,
      homeworkDone: 50,
      homeworkCorrect: 30,
    },
    {
      group: group(id(0xa2), '003', 'Китайский, группа Б', chinese),
      studentsCount: 1,
      attended: 12,
      missed: 3,
      homeworkDone: 20,
      homeworkCorrect: 18,
    },
    {
      group: group(id(0xa3), null, 'Шахматы, группа А', chess),
      studentsCount: 0,
      attended: 0,
      missed: 0,
      homeworkDone: 0,
      homeworkCorrect: 0,
    },
  ],
});

const student = (n: number, firstName: string, lastName: string) => ({
  id: id(0xe0 + n),
  user: { id: id(0xd0 + n), firstName, lastName, nickname: null, avatarUrl: null },
  classLabel: '5А',
});
const EGOR = student(1, 'Егор', 'Иванов');

const groupDetail: GroupDetail = GroupDetailSchema.parse({
  ...group(ROBOTICS_A, '001', 'Робототехника, группа А', robotics),
  studentsCount: 2,
  attendanceRate: 0.9,
  completionRate: 0.5,
  needsAttentionCount: 0,
  nextLesson: null,
  schedule: [],
  students: [
    {
      student: EGOR,
      attendanceRate: 0.92,
      completionRate: 0.5,
      progress: 40,
      activityScore: 70,
      needsAttention: [],
    },
    {
      student: student(2, 'Дарья', 'Петрова'),
      attendanceRate: 0.75,
      completionRate: 0.3,
      progress: 25,
      activityScore: 40,
      needsAttention: ['Пропуски'],
    },
  ],
});

/** Результат useQuery в готовом состоянии — страницам достаточно этих полей. */
const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  isPlaceholderData: false,
  refetch: vi.fn(),
});

const failed = (error: unknown) => ({
  data: undefined,
  error,
  isPending: false,
  isError: true,
  isSuccess: false,
  isPlaceholderData: false,
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({
  performance: null as unknown,
  group: null as unknown,
  periods: [] as string[],
}));

vi.mock('@/entities/group', async (importOriginal) => ({
  ...(await importOriginal<typeof GroupEntity>()),
  useTeacherPerformance: (period: string) => {
    hooks.periods.push(period);
    return hooks.performance;
  },
  useTeacherGroup: () => hooks.group,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname + location.search}
    </output>
  );
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/teacher/performance" element={<PerformancePage />} />
            <Route path="/teacher/performance/groups/:groupId" element={<GroupStudentsPage />} />
            <Route path="/teacher/students/:studentId" element={<p>Успеваемость ученика</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByTestId('location');

beforeEach(() => {
  hooks.performance = ready(performance);
  hooks.group = ready(groupDetail);
  hooks.periods = [];
});

describe('Общая успеваемость преподавателя', () => {
  it('показывает посещения по группам и таблицу заданий; период меняет запрос и URL', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/performance');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Общая успеваемость' }),
    ).toBeInTheDocument();
    const periods = screen.getByRole('radiogroup', { name: 'Период' });
    expect(within(periods).getByRole('radio', { name: '1 день' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      within(periods)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['1 день', '7 дней', '30 дней', '1 курс']);
    expect(hooks.periods.at(-1)).toBe('day');

    expect(screen.getByRole('heading', { level: 2, name: 'Посещения' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name:
          'Посещения по группам: группа 001 (Робототехника): посетили 15, пропустили 4; ' +
          'группа 003 (Китайский): посетили 12, пропустили 3; ' +
          'группа Шахматы, группа А (Шахматы): занятий не было',
      }),
    ).toBeInTheDocument();
    // Легенда по курсам — каждый курс один раз, даже если групп несколько.
    expect(screen.getAllByText('посетили')).toHaveLength(3);

    const table = screen.getByRole('table', { name: 'Домашние задания по группам' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Группа', 'Правильно выполненные дз', 'Выполненные дз']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '0013050',
      '0031820',
      'Шахматы, группа А00',
    ]);

    await user.click(within(periods).getByRole('radio', { name: '7 дней' }));
    expect(hooks.periods.at(-1)).toBe('week');
    expect(location()).toHaveTextContent('/teacher/performance?period=week');

    await user.click(within(periods).getByRole('radio', { name: '1 курс' }));
    expect(hooks.periods.at(-1)).toBe('course');

    // Период по умолчанию в URL не пишется.
    await user.click(within(periods).getByRole('radio', { name: '1 день' }));
    expect(hooks.periods.at(-1)).toBe('day');
    expect(location().textContent).toBe('/teacher/performance');
  });

  it('период из ссылки; строка таблицы → ученики группы, «назад» сохраняет период', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/performance?period=month');

    expect(hooks.periods.at(-1)).toBe('month');
    expect(screen.getByRole('radio', { name: '30 дней' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: 'Группа 001: ученики' }));
    expect(location()).toHaveTextContent(`/teacher/performance/groups/${ROBOTICS_A}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Группа 001' })).toBeInTheDocument();
    expect(screen.getByText('Робототехника')).toBeInTheDocument();
    // Intl ставит неразрывный пробел перед «%» в ru.
    expect(screen.getByText(/^посещаемость 92\s?% · прогресс 40%$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(location().textContent).toBe('/teacher/performance?period=month');
  });

  it('ученик группы открывает его успеваемость из приложения', async () => {
    const user = userEvent.setup();
    renderAt(`/teacher/performance/groups/${ROBOTICS_A}`);

    await user.click(screen.getByRole('button', { name: /Егор Иванов/ }));
    expect(location().textContent).toBe(`/teacher/students/${EGOR.id}`);
    expect(location()).toHaveAttribute('data-state', JSON.stringify({ fromApp: true }));
    expect(screen.getByText('Успеваемость ученика')).toBeInTheDocument();
  });

  it('по прямой ссылке «назад» из группы ведёт к общей успеваемости', async () => {
    const user = userEvent.setup();
    renderAt(`/teacher/performance/groups/${ROBOTICS_A}`);

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(location().textContent).toBe('/teacher/performance');
  });

  it('без групп — пустое состояние', () => {
    hooks.performance = ready({ ...performance, groups: [] });
    renderAt('/teacher/performance');

    expect(screen.getByText('Групп пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Переключатель периода остаётся: в другом периоде группы тоже не появятся, но экран цельный.
    expect(screen.getByRole('radiogroup', { name: 'Период' })).toBeInTheDocument();
  });

  it('чужая группа — «Группа не найдена» с возвратом к успеваемости', async () => {
    const user = userEvent.setup();
    hooks.group = failed(
      new ApiClientError({ code: 'FORBIDDEN', message: 'Не ваша группа', status: 403 }),
    );
    renderAt(`/teacher/performance/groups/${ROBOTICS_A}`);

    expect(screen.getByRole('heading', { level: 1, name: 'Группа' })).toBeInTheDocument();
    expect(screen.getByText('Группа не найдена')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'К успеваемости' }));
    expect(location().textContent).toBe('/teacher/performance');
  });

  it('404 (ручки ещё нет) — «Раздел в разработке», а не «Группа не найдена»', () => {
    hooks.group = failed(
      new ApiClientError({ code: 'NOT_FOUND', message: 'Not Found', status: 404 }),
    );
    renderAt(`/teacher/performance/groups/${ROBOTICS_A}`);

    expect(screen.getByText('Раздел в разработке')).toBeInTheDocument();
    expect(screen.queryByText('Группа не найдена')).not.toBeInTheDocument();
  });

  it('группа без учеников — пустое состояние', () => {
    hooks.group = ready({ ...groupDetail, students: [] });
    renderAt(`/teacher/performance/groups/${ROBOTICS_A}`);

    expect(screen.getByText('В группе пока нет учеников')).toBeInTheDocument();
  });
});
