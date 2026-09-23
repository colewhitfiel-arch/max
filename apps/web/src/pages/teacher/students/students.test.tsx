import {
  GroupHomeworkTasksSchema,
  TeacherStudentCardSchema,
  type GroupHomeworkTasks,
  type TeacherStudentCard,
} from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StudentEntity from '@/entities/student';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { StudentPerformancePage } from './ui/StudentPerformancePage';
import { StudentTasksPage } from './ui/StudentTasksPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const STUDENT = id(0xe1);
const ROBOTICS = id(0xa1);
const CHINESE = id(0xa2);
const task = (n: number) => id(0x100 + n);

const teacher = {
  id: id(0xf1),
  user: { id: id(0xf2), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const robotics = { id: id(0xc1), title: 'Робототехника', category: 'ROBOTICS', coverUrl: null };
const chinese = { id: id(0xc2), title: 'Китайский', category: 'LANGUAGES', coverUrl: null };
const roboticsGroup = {
  id: ROBOTICS,
  title: 'Робототехника, группа А',
  code: '001',
  club: robotics,
  teacher,
};
const chineseGroup = {
  id: CHINESE,
  title: 'Китайский, группа Б',
  code: '003',
  club: chinese,
  teacher,
};

const card: TeacherStudentCard = TeacherStudentCardSchema.parse({
  student: {
    id: STUDENT,
    user: { id: id(0xd1), firstName: 'Егор', lastName: 'Иванов', nickname: null, avatarUrl: null },
    classLabel: '5А',
  },
  groups: [roboticsGroup, chineseGroup],
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
  history: [],
  attendanceHistory: [],
  aiSummary: null,
  needsAttention: [],
  week: ['ATTENDED', 'MISSED', 'TODAY', 'UPCOMING', 'NO_LESSONS', 'NO_LESSONS', 'UPCOMING'].map(
    (status, index) => ({ date: `2026-09-${21 + index}`, status }),
  ),
  homework: { correct: 2, wrong: 1, upcoming: 2 },
  clubHomework: [
    {
      club: robotics,
      group: roboticsGroup,
      counts: { correct: 1, wrong: 1, upcoming: 1 },
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
      ],
    },
    {
      club: chinese,
      group: chineseGroup,
      counts: { correct: 1, wrong: 0, upcoming: 1 },
      tasks: [
        {
          assignmentId: task(4),
          number: 1,
          title: 'Иероглифы',
          status: 'DONE',
          dueAt: null,
          scorePercent: null,
        },
        {
          assignmentId: task(5),
          number: 2,
          title: 'Диалог',
          status: 'LATER',
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
      ...card.clubHomework![0]!.tasks[0],
      statement: 'Напишите функцию чтения датчика',
      code: { language: 'python', source: 'def read():\n    return 15' },
      answer: 'read_distance',
      correctAnswer: 'read_distance',
      score: 8,
      maxScore: 10,
    },
    {
      ...card.clubHomework![0]!.tasks[1],
      statement: 'Подставьте функцию вместо __________, чтобы робот останавливался',
      code: null,
      answer: 'move_backward',
      correctAnswer: 'stop_robot',
      score: 1,
      maxScore: 10,
    },
    {
      ...card.clubHomework![0]!.tasks[2],
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

const forbidden = () => ({
  data: undefined,
  error: new ApiClientError({
    code: 'FORBIDDEN',
    message: 'Ученик не из ваших групп',
    status: 403,
  }),
  isPending: false,
  isError: true,
  isSuccess: false,
  refetch: vi.fn(),
});

/** Ручки нет на сервере (real-режим до backend F): голый 404 → NOT_IMPLEMENTED, «Раздел в разработке». */
const notFound = () => ({
  ...forbidden(),
  error: new ApiClientError({ code: 'NOT_IMPLEMENTED', message: 'HTTP 404', status: 404 }),
});

const hooks = vi.hoisted(() => ({
  student: null as unknown,
  tasks: null as unknown,
}));

vi.mock('@/entities/student', async (importOriginal) => ({
  ...(await importOriginal<typeof StudentEntity>()),
  useTeacherStudent: () => hooks.student,
  useTeacherStudentGroupTasks: () => hooks.tasks,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(entries: InitialEntry[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
          <Routes>
            <Route path="/teacher/performance" element={<p>Экран общей успеваемости</p>} />
            <Route path="/teacher/performance/groups/:groupId" element={<p>Ученики группы</p>} />
            <Route path="/teacher/students/:studentId" element={<StudentPerformancePage />} />
            <Route
              path="/teacher/students/:studentId/groups/:groupId/tasks"
              element={<StudentTasksPage />}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByTestId('location');
const scrollIntoView = vi.fn();

beforeEach(() => {
  hooks.student = ready(card);
  hooks.tasks = ready(groupTasks);
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  scrollIntoView.mockReset();
});

describe('Успеваемость ученика у преподавателя', () => {
  it('шапка с учеником, посещения, диаграмма и курсы; курс раскрывается в ?club=, «✕» — назад', async () => {
    const user = userEvent.setup();
    renderAt([
      `/teacher/performance/groups/${ROBOTICS}`,
      { pathname: `/teacher/students/${STUDENT}`, state: { fromApp: true } },
    ]);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Успеваемость ученика: Иванов Е.' }),
    ).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Закрыть успеваемость' });
    expect(close).toHaveTextContent('Успеваемость');
    expect(screen.getByRole('heading', { name: 'Посещения' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Домашние задачи: правильно 2, неправильно 1, предстоят 2' }),
    ).toBeInTheDocument();

    const roboticsBand = screen.getByRole('region', { name: 'Робототехника' });
    const chineseBand = screen.getByRole('region', { name: 'Китайский' });
    expect(screen.queryByRole('button', { name: /^Задание 1/ })).not.toBeInTheDocument();

    await user.click(within(roboticsBand).getByRole('button', { name: 'Подробнее' }));
    expect(location()).toHaveTextContent(`/teacher/students/${STUDENT}?club=${ROBOTICS}`);
    expect(within(roboticsBand).getByRole('button', { name: 'Скрыть' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      within(roboticsBand).getByRole('button', { name: 'Задание 2 — правильно меньше 30%' }),
    ).toBeInTheDocument();

    // Раскрыт один курс за раз.
    await user.click(within(chineseBand).getByRole('button', { name: 'Подробнее' }));
    expect(location()).toHaveTextContent(`?club=${CHINESE}`);
    expect(within(roboticsBand).getByRole('button', { name: 'Подробнее' })).toBeInTheDocument();

    // Раскрытие курса не теряет «открыт из приложения»: «✕» — шаг назад по истории.
    await user.click(close);
    expect(location().textContent).toBe(`/teacher/performance/groups/${ROBOTICS}`);
  });

  it('клетка открывает задания: ответ, правильный ответ, «Предстоит выполнить»; «Задания ✕» — назад', async () => {
    const user = userEvent.setup();
    renderAt([`/teacher/students/${STUDENT}?club=${ROBOTICS}`]);

    await user.click(screen.getByRole('button', { name: 'Задание 2 — правильно меньше 30%' }));
    expect(location()).toHaveTextContent(
      `/teacher/students/${STUDENT}/groups/${ROBOTICS}/tasks?task=${task(2)}`,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Задания ученика: Иванов Е.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Робототехника' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть задания' })).toHaveTextContent('Задания');

    const failed = screen.getByRole('region', { name: 'Задание 2' });
    expect(
      within(failed).getByRole('heading', { level: 3, name: 'Задание 2' }),
    ).toBeInTheDocument();
    expect(within(failed).getByText('Ответ: move_backward')).toBeInTheDocument();
    expect(within(failed).getByText('Правильный ответ: stop_robot')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(failed);

    const upcoming = screen.getByRole('region', { name: 'Задание 3' });
    expect(within(upcoming).getByText('Предстоит выполнить')).toBeInTheDocument();
    expect(within(upcoming).getByRole('button', { name: 'копировать' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Закрыть задания' }));
    expect(location().textContent).toBe(`/teacher/students/${STUDENT}?club=${ROBOTICS}`);
    expect(
      within(screen.getByRole('region', { name: 'Робототехника' })).getByRole('button', {
        name: 'Скрыть',
      }),
    ).toBeInTheDocument();
  });

  it('по прямой ссылке «Задания ✕» открывает успеваемость с раскрытым курсом', async () => {
    const user = userEvent.setup();
    renderAt([`/teacher/students/${STUDENT}/groups/${ROBOTICS}/tasks`]);
    expect(scrollIntoView).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Закрыть задания' }));
    expect(location().textContent).toBe(`/teacher/students/${STUDENT}?club=${ROBOTICS}`);
  });

  it('по прямой ссылке «Успеваемость ✕» ведёт к общей успеваемости', async () => {
    const user = userEvent.setup();
    renderAt([`/teacher/students/${STUDENT}`]);

    await user.click(screen.getByRole('button', { name: 'Закрыть успеваемость' }));
    expect(location().textContent).toBe('/teacher/performance');
    expect(screen.getByText('Экран общей успеваемости')).toBeInTheDocument();
  });

  it('403 — «Ученик не в ваших группах» с кнопкой «К успеваемости»', async () => {
    const user = userEvent.setup();
    hooks.student = forbidden();
    renderAt([`/teacher/students/${STUDENT}`]);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Успеваемость ученика' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ученик не в ваших группах')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Посещения' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'К успеваемости' }));
    expect(location().textContent).toBe('/teacher/performance');
  });

  it('403 на заданиях чужой группы — то же пустое состояние', () => {
    hooks.tasks = forbidden();
    renderAt([`/teacher/students/${STUDENT}/groups/${CHINESE}/tasks`]);

    expect(screen.getByText('Ученик не в ваших группах')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Задания группы' })).not.toBeInTheDocument();
  });

  it('404 (ручки ещё нет) — «Раздел в разработке», а не «Ученик не в ваших группах»', () => {
    hooks.student = notFound();
    const { unmount } = renderAt([`/teacher/students/${STUDENT}`]);
    expect(screen.getByText('Раздел в разработке')).toBeInTheDocument();
    expect(screen.queryByText('Ученик не в ваших группах')).not.toBeInTheDocument();
    unmount();

    hooks.tasks = notFound();
    renderAt([`/teacher/students/${STUDENT}/groups/${ROBOTICS}/tasks`]);
    expect(screen.getByText('Раздел в разработке')).toBeInTheDocument();
    expect(screen.queryByText('Ученик не в ваших группах')).not.toBeInTheDocument();
  });

  it('в группе нет заданий — пустое состояние под названием курса', () => {
    hooks.tasks = ready({ ...groupTasks, items: [] });
    renderAt([`/teacher/students/${STUDENT}/groups/${ROBOTICS}/tasks`]);

    expect(screen.getByRole('heading', { level: 2, name: 'Робототехника' })).toBeInTheDocument();
    expect(screen.getByText('Заданий пока нет')).toBeInTheDocument();
  });
});
