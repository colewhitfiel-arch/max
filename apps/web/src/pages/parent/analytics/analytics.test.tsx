import {
  ChildAnalyticsDtoSchema,
  ChildrenListSchema,
  GroupHomeworkTasksSchema,
  type ChildAnalyticsDto,
  type ChildrenList,
  type GroupHomeworkTasks,
} from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { ChildAnalyticsPage } from './ui/ChildAnalyticsPage';
import { TaskDetailsPage } from './ui/TaskDetailsPage';

const STUDENT = '0190a000-0000-7000-8000-000000000001';
const ROBOTICS = '0190a000-0000-7000-8000-0000000000a1';
const CHESS = '0190a000-0000-7000-8000-0000000000a2';
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
const club = (id: string, title: string, category: 'ROBOTICS' | 'CHESS') => ({
  id,
  title,
  category,
  coverUrl: null,
});
const robotics = club('0190a000-0000-7000-8000-0000000000c1', 'Робототехника', 'ROBOTICS');
const chess = club('0190a000-0000-7000-8000-0000000000c2', 'Шахматы', 'CHESS');
const roboticsGroup = { id: ROBOTICS, title: '001', club: robotics, teacher };
const chessGroup = { id: CHESS, title: '002', club: chess, teacher };

const childrenList: ChildrenList = ChildrenListSchema.parse({
  items: [
    {
      student: {
        id: STUDENT,
        user: {
          id: '0190a000-0000-7000-8000-0000000000e1',
          firstName: 'Егор',
          lastName: 'Иванов',
          nickname: null,
          avatarUrl: null,
        },
        classLabel: '5А',
      },
      linkStatus: 'ACTIVE',
      school: null,
    },
  ],
});

const analytics: ChildAnalyticsDto = ChildAnalyticsDtoSchema.parse({
  stats: {
    attendanceRate: 0.9,
    completionRate: 0.5,
    activityScore: 70,
    absences: 1,
    lateCount: 0,
    period: { from: '2026-08-25', to: '2026-09-23' },
  },
  clubs: [],
  weekly: [],
  recentResults: [],
  attendanceHistory: [],
  aiSummary: null,
  week: ['ATTENDED', 'MISSED', 'TODAY', 'UPCOMING', 'NO_LESSONS', 'NO_LESSONS', 'UPCOMING'].map(
    (status, index) => ({ date: `2026-09-${21 + index}`, status }),
  ),
  homework: { correct: 2, wrong: 1, upcoming: 2 },
  clubHomework: [
    {
      club: robotics,
      group: roboticsGroup,
      counts: { correct: 1, wrong: 1, upcoming: 2 },
      tasks: [
        {
          assignmentId: task(1),
          number: 1,
          title: 'Датчик расстояния',
          status: 'DONE',
          dueAt: '2026-09-10T15:00:00.000Z',
          scorePercent: 80,
        },
        {
          assignmentId: task(2),
          number: 2,
          title: 'Остановка робота',
          status: 'FAILED',
          dueAt: '2026-09-15T15:00:00.000Z',
          scorePercent: 10,
        },
        {
          assignmentId: task(3),
          number: 3,
          title: 'Поворот',
          status: 'SOON',
          dueAt: '2026-09-24T15:00:00.000Z',
          scorePercent: null,
        },
        {
          assignmentId: task(4),
          number: 4,
          title: 'Лабиринт',
          status: 'LATER',
          dueAt: null,
          scorePercent: null,
        },
      ],
    },
    {
      club: chess,
      group: chessGroup,
      counts: { correct: 1, wrong: 0, upcoming: 0 },
      tasks: [
        {
          assignmentId: task(5),
          number: 1,
          title: 'Мат в два хода',
          status: 'DONE',
          dueAt: null,
          scorePercent: null,
        },
      ],
    },
  ],
});

const groupTasks: GroupHomeworkTasks = GroupHomeworkTasksSchema.parse({
  group: roboticsGroup,
  items: [
    {
      ...analytics.clubHomework![0]!.tasks[0],
      statement: 'Напишите функцию чтения датчика',
      code: { language: 'python', source: 'def read():\n    return 15' },
      answer: 'read_distance',
      correctAnswer: 'read_distance',
      score: 8,
      maxScore: 10,
    },
    {
      ...analytics.clubHomework![0]!.tasks[1],
      statement: 'Подставьте функцию вместо __________, чтобы робот останавливался',
      code: null,
      answer: 'move_backward',
      correctAnswer: 'stop_robot',
      score: 1,
      maxScore: 10,
    },
    {
      ...analytics.clubHomework![0]!.tasks[2],
      statement: 'Подставьте команду вместо пропуска',
      code: { language: 'cpp', source: 'int front = readDistance(FRONT);' },
      answer: null,
      correctAnswer: null,
      score: null,
      maxScore: 10,
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
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({
  children: null as unknown,
}));

vi.mock('@/entities/student', () => ({
  useChildren: () => hooks.children,
  useChildPerformance: () => ready(analytics),
  useChildGroupTasks: () => ready(groupTasks),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/parent/analytics" element={<p>Выбор ребёнка</p>} />
            <Route path="/parent/analytics/:studentId" element={<ChildAnalyticsPage />} />
            <Route
              path="/parent/analytics/:studentId/groups/:groupId/tasks"
              element={<TaskDetailsPage />}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  hooks.children = ready(childrenList);
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  scrollIntoView.mockReset();
});

describe('Успеваемость ребёнка', () => {
  it('показывает посещения, диаграмму и полосы кружков; раскрыт только один кружок', async () => {
    const user = userEvent.setup();
    renderAt(`/parent/analytics/${STUDENT}`);

    expect(screen.getByRole('heading', { level: 1, name: 'Успеваемость' })).toBeInTheDocument();
    expect(screen.getByText('Егор Иванов')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Посещения' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Домашние задачи: правильно 2, неправильно 1, предстоят 2' }),
    ).toBeInTheDocument();

    const roboticsBand = screen.getByRole('region', { name: 'Робототехника' });
    const chessBand = screen.getByRole('region', { name: 'Шахматы' });
    expect(within(roboticsBand).getByRole('list', { name: /Робототехника/ })).toHaveTextContent(
      'Правильно: 1',
    );
    expect(screen.queryByRole('button', { name: /^Задание 1/ })).not.toBeInTheDocument();

    await user.click(within(roboticsBand).getByRole('button', { name: 'Подробнее' }));
    const hide = within(roboticsBand).getByRole('button', { name: 'Скрыть' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent(`?club=${ROBOTICS}`);
    expect(
      within(roboticsBand).getByRole('button', { name: 'Задание 2 — правильно меньше 30%' }),
    ).toBeInTheDocument();
    expect(
      within(roboticsBand).getByRole('button', { name: 'Задание 4 — дедлайн не скоро' }),
    ).toBeInTheDocument();

    // Второй кружок раскрывается вместо первого.
    await user.click(within(chessBand).getByRole('button', { name: 'Подробнее' }));
    expect(within(roboticsBand).getByRole('button', { name: 'Подробнее' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(chessBand).getByRole('button', { name: 'Скрыть' })).toBeInTheDocument();

    await user.click(within(chessBand).getByRole('button', { name: 'Скрыть' }));
    expect(screen.queryAllByRole('button', { name: 'Скрыть' })).toHaveLength(0);
    expect(screen.getByTestId('location')).toHaveTextContent(
      new RegExp(`/parent/analytics/${STUDENT}$`),
    );
  });

  it('стрелки ходят по сетке, клетка открывает подробности, «Задания ×» возвращает назад', async () => {
    const user = userEvent.setup();
    renderAt(`/parent/analytics/${STUDENT}?club=${ROBOTICS}`);

    const first = screen.getByRole('button', { name: 'Задание 1 — выполнено' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    const second = screen.getByRole('button', { name: 'Задание 2 — правильно меньше 30%' });
    expect(second).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/parent/analytics/${STUDENT}/groups/${ROBOTICS}/tasks?task=${task(2)}`,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Робототехника' })).toBeInTheDocument();
    const failed = screen.getByRole('region', { name: 'Задание 2' });
    expect(within(failed).getByText('Ответ: move_backward')).toBeInTheDocument();
    expect(within(failed).getByText('Правильный ответ: stop_robot')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(failed);

    const upcoming = screen.getByRole('region', { name: 'Задание 3' });
    expect(within(upcoming).getByText('Предстоит выполнить')).toBeInTheDocument();
    expect(within(upcoming).getByRole('button', { name: 'копировать' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Закрыть задания' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`?club=${ROBOTICS}`);
    expect(
      within(screen.getByRole('region', { name: 'Робототехника' })).getByRole('button', {
        name: 'Скрыть',
      }),
    ).toBeInTheDocument();
  });

  it('по прямой ссылке «Задания ×» открывает аналитику с раскрытым кружком', async () => {
    const user = userEvent.setup();
    renderAt(`/parent/analytics/${STUDENT}/groups/${ROBOTICS}/tasks`);
    expect(scrollIntoView).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Закрыть задания' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/parent/analytics/${STUDENT}?club=${ROBOTICS}`,
    );
  });

  it('чужой или отвязанный ребёнок — пустое состояние с возвратом к выбору', async () => {
    const user = userEvent.setup();
    hooks.children = ready({ items: [] });
    renderAt(`/parent/analytics/${STUDENT}`);

    expect(screen.getByText('Ребёнок не найден')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'К списку детей' }));
    expect(screen.getByText('Выбор ребёнка')).toBeInTheDocument();
  });
});
