/**
 * Экран заданий преподавателя: две кнопки внизу (задать ДЗ, посещаемость), адресат в подписи
 * задания; мастер «Задать ДЗ» — группа → ученики → материал, и что уходит в create; без групп —
 * к созданию группы, пустая группа — к её составу.
 */
import {
  GroupDetailSchema,
  TeacherAssignmentCardSchema,
  TeacherCoursesListSchema,
  TeacherGroupsListSchema,
  paginated,
} from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type * as AssignmentEntity from '@/entities/assignment';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { AssignHomeworkPage } from './ui/AssignHomeworkPage';
import { TeacherAssignmentsPage } from './ui/TeacherAssignmentsPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const GROUP_ID = id(0x40);

const club = {
  id: id(0x30),
  title: 'Робототехника',
  category: 'ROBOTICS' as const,
  coverUrl: null,
};
const teacher = {
  id: id(0x20),
  photoUrl: null,
  user: { id: id(0x10), firstName: 'Мария', lastName: null, nickname: null, avatarUrl: null },
};
const group = { id: GROUP_ID, title: 'Робототехника, А', code: null, club, teacher };

const student = (n: number, firstName: string) => ({
  id: id(n),
  classLabel: '6А',
  user: { id: id(n + 100), firstName, lastName: null, nickname: null, avatarUrl: null },
});

const card = (overrides: Record<string, unknown>) =>
  TeacherAssignmentCardSchema.parse({
    id: id(0x100),
    title: 'Схема датчика',
    type: 'HOMEWORK',
    dueAt: null,
    maxScore: 100,
    group,
    description: null,
    allowedAttempts: null,
    publishedAt: '2026-09-20T10:00:00.000Z',
    studentIds: [],
    courseId: null,
    studentsCount: 2,
    submittedCount: 1,
    gradedCount: 0,
    ...overrides,
  });

const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({
  assignments: null as unknown,
  groups: null as unknown,
  group: null as unknown,
  courses: null as unknown,
  create: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/entities/assignment', async (importOriginal) => ({
  ...(await importOriginal<typeof AssignmentEntity>()),
  useTeacherAssignments: () => hooks.assignments,
}));
vi.mock('@/entities/group', () => ({
  useTeacherGroups: () => hooks.groups,
  useTeacherGroup: () => hooks.group,
}));
vi.mock('@/entities/course', () => ({ useTeacherCourses: () => hooks.courses }));
vi.mock('@/entities/generation', () => ({ useCreateGenerationJob: () => hooks.create }));

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string) {
  // QueryClient нужен колокольчику в шапке (`ScreenHeader bell` сам ходит за уведомлениями).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Location />
          <Routes>
            <Route path="/teacher/assignments" element={<TeacherAssignmentsPage />} />
            <Route path="/teacher/assignments/new" element={<AssignHomeworkPage />} />
            <Route path="/teacher/attendance" element={<div>экран посещаемости</div>} />
            <Route path="*" element={<div>другой экран</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hooks.create = { mutate: vi.fn(), isPending: false };
  hooks.assignments = ready(paginated(TeacherAssignmentCardSchema).parse({ items: [card({})] }));
  hooks.groups = ready(TeacherGroupsListSchema.parse({ items: [] }));
  hooks.courses = ready(TeacherCoursesListSchema.parse({ items: [] }));
  hooks.group = ready(
    GroupDetailSchema.parse({
      ...group,
      studentsCount: 2,
      attendanceRate: null,
      completionRate: null,
      needsAttentionCount: 0,
      nextLesson: null,
      schedule: [],
      students: [
        {
          student: student(0x21, 'Алексей'),
          attendanceRate: null,
          completionRate: null,
          progress: 0,
          activityScore: 0,
          needsAttention: [],
        },
        {
          student: student(0x22, 'Даша'),
          attendanceRate: null,
          completionRate: null,
          progress: 0,
          activityScore: 0,
          needsAttention: [],
        },
      ],
    }),
  );
});

describe('Задания преподавателя', () => {
  it('две кнопки внизу ведут в мастер ДЗ и в посещаемость', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/assignments');

    await user.click(screen.getByRole('button', { name: 'Отметить посещаемость' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/attendance');
  });

  it('«Задать ДЗ» открывает мастер', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/assignments');

    await user.click(screen.getByRole('button', { name: 'Задать ДЗ' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/assignments/new');
  });

  it('в подписи видно, кому задание: всей группе или адресно', () => {
    hooks.assignments = ready(
      paginated(TeacherAssignmentCardSchema).parse({
        items: [card({}), card({ id: id(0x101), studentIds: [id(0x21)], studentsCount: 1 })],
      }),
    );
    renderAt('/teacher/assignments');

    expect(screen.getByText(/всей группе/)).toBeInTheDocument();
    expect(screen.getByText(/1 ученику/)).toBeInTheDocument();
  });
});

describe('Мастер «Задать ДЗ»', () => {
  const pickGroup = (user: ReturnType<typeof userEvent.setup>) =>
    user.selectOptions(screen.getByLabelText(/Группа/), GROUP_ID);

  beforeEach(() => {
    hooks.groups = ready(
      TeacherGroupsListSchema.parse({
        items: [
          {
            ...group,
            studentsCount: 2,
            attendanceRate: null,
            completionRate: null,
            needsAttentionCount: 0,
            nextLesson: null,
          },
        ],
      }),
    );
  });

  it('без группы дальше не пускает', () => {
    renderAt('/teacher/assignments/new');
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
  });

  it('групп нет — предлагает создать группу', async () => {
    const user = userEvent.setup();
    hooks.groups = ready(TeacherGroupsListSchema.parse({ items: [] }));
    renderAt('/teacher/assignments/new');

    expect(screen.getByText('Сначала создайте группу')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Создать группу' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/groups/new');
  });

  it('в группе нет учеников — подсказка и переход к составу группы', async () => {
    const user = userEvent.setup();
    hooks.groups = ready(
      TeacherGroupsListSchema.parse({
        items: [
          {
            ...group,
            studentsCount: 0,
            attendanceRate: null,
            completionRate: null,
            needsAttentionCount: 0,
            nextLesson: null,
          },
        ],
      }),
    );
    renderAt('/teacher/assignments/new');
    await pickGroup(user);

    expect(screen.getByText(/В группе пока нет учеников/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить учеников' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/teacher/groups/${GROUP_ID}/edit`);
  });

  it('по умолчанию — вся группа; можно выбрать конкретных учеников', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/assignments/new');
    await pickGroup(user);

    const who = screen.getByRole('radiogroup', { name: 'Кому задаём' });
    expect(within(who).getByRole('radio', { name: 'Всей группе' })).toBeChecked();

    await user.click(within(who).getByRole('radio', { name: 'Выбрать учеников' }));
    // Пока никто не выбран — дальше нельзя: задание без адресатов бессмысленно.
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Даша' }));
    expect(screen.getByText('Выбран 1 ученик')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled();
  });

  it('проходит все шаги и отправляет ДЗ выбранному ученику', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/assignments/new');
    await pickGroup(user);

    const who = screen.getByRole('radiogroup', { name: 'Кому задаём' });
    await user.click(within(who).getByRole('radio', { name: 'Выбрать учеников' }));
    await user.click(screen.getByRole('checkbox', { name: 'Даша' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    // Шаг «что»: по умолчанию одно ДЗ в новый курс.
    const what = screen.getByRole('radiogroup', { name: 'Что создаём' });
    expect(within(what).getByRole('radio', { name: 'Одно ДЗ' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    // Шаг «материал»: описываем словами.
    await user.type(
      screen.getByLabelText(/Тема или задание/),
      'Повторить умножение дробей, восемь задач с разбором ошибок',
    );
    await user.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    expect(hooks.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: GROUP_ID,
        target: 'HOMEWORK',
        studentIds: [id(0x22)],
        topic: 'Повторить умножение дробей, восемь задач с разбором ошибок',
      }),
      expect.anything(),
    );
    // Всей группе — поле адресатов не уходит вовсе.
    expect(hooks.create.mutate.mock.calls[0]![0]).not.toHaveProperty('targetCourseId');
  });

  it('можно дополнить существующий курс группы', async () => {
    const user = userEvent.setup();
    hooks.courses = ready(
      TeacherCoursesListSchema.parse({
        items: [
          {
            id: id(0x80),
            title: 'Основы робототехники',
            group,
            status: 'PUBLISHED',
            modulesCount: 2,
            blocksCount: 6,
            publishedAt: '2026-09-01T10:00:00.000Z',
            avgProgress: 40,
          },
        ],
      }),
    );
    renderAt('/teacher/assignments/new');
    await pickGroup(user);
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    await user.selectOptions(screen.getByLabelText(/Курс/), id(0x80));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.type(screen.getByLabelText(/Тема или задание/), 'Датчик расстояния HC-SR04');
    await user.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    expect(hooks.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ targetCourseId: id(0x80), target: 'HOMEWORK' }),
      expect.anything(),
    );
  });
});
