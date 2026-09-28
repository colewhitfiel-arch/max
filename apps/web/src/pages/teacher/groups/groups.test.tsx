/**
 * Группы преподавателя: список (плюрализация «требует внимания», «Создать группу») и карточка
 * группы — пустые расписание/ученики, чужая группа (403) — «Группа не найдена» с возвратом к
 * списку; создание группы (название + кружок) и правка названия и состава.
 */
import { GroupDetailSchema, type GroupDetail } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { CreateGroupPage } from './ui/CreateGroupPage';
import { GroupPage } from './ui/GroupPage';
import { GroupsPage } from './ui/GroupsPage';
import { ManageGroupPage } from './ui/ManageGroupPage';

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

type Mutation = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  variables?: unknown;
};

/** Мутация, которая сразу «отвечает» `result` (onSuccess), как сервер. */
const mutation = (result?: unknown): Mutation => ({
  mutate: vi.fn((_vars: unknown, options?: { onSuccess?: (data: unknown) => void }) =>
    options?.onSuccess?.(result),
  ),
  isPending: false,
});

const hooks = vi.hoisted(() => ({
  groups: null as unknown,
  group: null as unknown,
  lessons: null as unknown,
  clubs: null as unknown,
  candidates: null as unknown,
  create: null as unknown,
  update: null as unknown,
  add: null as unknown,
  remove: null as unknown,
}));

vi.mock('@/entities/group', () => ({
  useTeacherGroups: () => hooks.groups,
  useTeacherGroup: () => hooks.group,
  useCreateGroup: () => hooks.create,
  useUpdateGroup: () => hooks.update,
  useGroupCandidates: () => hooks.candidates,
  useAddGroupStudent: () => hooks.add,
  useRemoveGroupStudent: () => hooks.remove,
}));
vi.mock('@/entities/club', () => ({ useCatalogClubs: () => hooks.clubs }));
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
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/teacher/groups" element={<GroupsPage />} />
            <Route path="/teacher/groups/new" element={<CreateGroupPage />} />
            <Route path="/teacher/groups/:groupId" element={<GroupPage />} />
            <Route path="/teacher/groups/:groupId/edit" element={<ManageGroupPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const student = (n: number, firstName: string, lastName: string) => ({
  id: id(n),
  classLabel: '7Б',
  user: { id: id(n + 0x100), firstName, lastName, nickname: null, avatarUrl: null },
});
const alexey = student(0x21, 'Алексей', 'Смирнов');
const dasha = student(0x22, 'Даша', 'Иванова');

const withStudents = (students: Array<ReturnType<typeof student>>): GroupDetail =>
  GroupDetailSchema.parse({
    ...groupDetail,
    studentsCount: students.length,
    students: students.map((item) => ({
      student: item,
      attendanceRate: null,
      completionRate: null,
      progress: 0,
      activityScore: 0,
      needsAttention: [],
    })),
  });

beforeEach(() => {
  hooks.groups = ready({ items: [groupDetail] });
  hooks.group = ready(groupDetail);
  hooks.lessons = ready({ lessons: [] });
  hooks.clubs = ready({
    items: [
      { id: id(0xc1), title: 'Робототехника' },
      { id: id(0xc2), title: 'Программирование на Python' },
    ],
  });
  hooks.candidates = ready({ items: [] });
  hooks.create = mutation({ ...groupDetail, id: id(0xa2) });
  hooks.update = mutation();
  hooks.add = mutation();
  hooks.remove = mutation();
});

describe('GroupsPage', () => {
  it('«требует внимания» согласуется с числом', () => {
    renderAt('/teacher/groups');
    expect(screen.getByText('1 требует внимания')).toBeInTheDocument();
  });

  it('«Создать группу» ведёт на экран новой группы', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/groups');
    await user.click(screen.getByRole('button', { name: 'Создать группу' }));
    expect(screen.getByTestId('location').textContent).toBe('/teacher/groups/new');
  });
});

describe('CreateGroupPage', () => {
  it('без названия создать нельзя; кружок по умолчанию — первый', () => {
    renderAt('/teacher/groups/new');
    expect(screen.getByRole('button', { name: 'Создать группу' })).toBeDisabled();
    expect(screen.getByLabelText(/Кружок/)).toHaveValue(id(0xc1));
  });

  it('название и кружок уходят в create, затем — к составу новой группы', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/groups/new');

    await user.type(screen.getByLabelText(/Название/), '  Python, 5 класс ');
    await user.selectOptions(screen.getByLabelText(/Кружок/), id(0xc2));
    await user.click(screen.getByRole('button', { name: 'Создать группу' }));

    expect((hooks.create as Mutation).mutate).toHaveBeenCalledWith(
      { title: 'Python, 5 класс', clubId: id(0xc2) },
      expect.anything(),
    );
    expect(screen.getByTestId('location').textContent).toBe(`/teacher/groups/${id(0xa2)}/edit`);
  });

  it('кружков в школе нет — поле недоступно с пояснением', () => {
    hooks.clubs = ready({ items: [] });
    renderAt('/teacher/groups/new');
    expect(screen.getByText('В вашей школе пока нет кружков')).toBeInTheDocument();
    expect(screen.getByLabelText(/Кружок/)).toBeDisabled();
  });
});

describe('ManageGroupPage', () => {
  it('ученики группы убираются, кандидаты добавляются', async () => {
    const user = userEvent.setup();
    hooks.group = ready(withStudents([alexey]));
    hooks.candidates = ready({ items: [dasha] });
    renderAt(`/teacher/groups/${GROUP_ID}/edit`);

    expect(screen.getByText('В группе 1 ученик')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Убрать из группы: Алексей Смирнов' }));
    expect((hooks.remove as Mutation).mutate).toHaveBeenCalledWith(alexey.id, expect.anything());

    await user.click(screen.getByRole('button', { name: 'Добавить в группу: Даша Иванова' }));
    expect((hooks.add as Mutation).mutate).toHaveBeenCalledWith(dasha.id, expect.anything());
  });

  it('пустая группа и некого добавить — пустые состояния', () => {
    renderAt(`/teacher/groups/${GROUP_ID}/edit`);
    expect(screen.getByText('В группе пока нет учеников')).toBeInTheDocument();
    expect(screen.getByText('Добавить пока некого')).toBeInTheDocument();
  });

  it('переименование: кнопка появляется только при изменении названия', async () => {
    const user = userEvent.setup();
    renderAt(`/teacher/groups/${GROUP_ID}/edit`);

    expect(screen.queryByRole('button', { name: 'Сохранить название' })).not.toBeInTheDocument();
    const name = screen.getByLabelText(/Название/);
    await user.clear(name);
    await user.type(name, 'Робототехника, 7 класс');
    await user.click(screen.getByRole('button', { name: 'Сохранить название' }));
    expect((hooks.update as Mutation).mutate).toHaveBeenCalledWith(
      { title: 'Робототехника, 7 класс' },
      expect.anything(),
    );
  });

  it('переименование: сохранённое название, пока не пришёл перезапрос, повторно не сохраняется', async () => {
    // PATCH прошёл, а перезапрос группы ещё не вернул новое название в карточку.
    hooks.update = {
      ...mutation(),
      isSuccess: true,
      variables: { title: 'Робототехника, 7 класс' },
    };
    const user = userEvent.setup();
    renderAt(`/teacher/groups/${GROUP_ID}/edit`);

    const name = screen.getByLabelText(/Название/);
    await user.clear(name);
    await user.type(name, 'Робототехника, 7 класс');
    expect(screen.queryByRole('button', { name: 'Сохранить название' })).not.toBeInTheDocument();
    // Другое название — снова можно сохранить.
    await user.type(name, '!');
    expect(screen.getByRole('button', { name: 'Сохранить название' })).toBeInTheDocument();
  });

  it('чужая группа (403) — «Группа не найдена»', () => {
    hooks.group = failed(new ApiClientError({ code: 'FORBIDDEN', message: 'Нет', status: 403 }));
    renderAt(`/teacher/groups/${GROUP_ID}/edit`);
    expect(screen.getByText('Группа не найдена')).toBeInTheDocument();
  });
});

describe('GroupPage', () => {
  it('пустые расписание и список учеников — пустые состояния', () => {
    renderAt(`/teacher/groups/${GROUP_ID}`);
    expect(screen.getByText('Расписание не задано')).toBeInTheDocument();
    expect(screen.getByText('В группе пока нет учеников')).toBeInTheDocument();
  });

  it.each(['Изменить', 'Добавить учеников'])('«%s» ведёт к составу группы', async (name) => {
    const user = userEvent.setup();
    renderAt(`/teacher/groups/${GROUP_ID}`);
    await user.click(screen.getByRole('button', { name }));
    expect(screen.getByTestId('location').textContent).toBe(`/teacher/groups/${GROUP_ID}/edit`);
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
