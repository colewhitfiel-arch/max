/**
 * Курсы преподавателя: пустой курс/модуль — подсказки вместо пустых карточек; форма создания —
 * ошибка загрузки групп показывается у поля с «Повторить».
 */
import { TeacherCourseDetailSchema, type TeacherCourseDetail } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CourseEntity from '@/entities/course';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { TeacherCoursePage } from './ui/TeacherCoursePage';
import { TeacherCoursesPage } from './ui/TeacherCoursesPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const COURSE_ID = id(0xb1);

const course = (modules: unknown[]): TeacherCourseDetail =>
  TeacherCourseDetailSchema.parse({
    id: COURSE_ID,
    title: 'Циклы в Python',
    description: null,
    group: {
      id: id(0xa1),
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
    },
    status: 'DRAFT',
    version: 1,
    publishedAt: null,
    modules,
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

const hooks = vi.hoisted(() => ({
  course: null as unknown,
  courses: null as unknown,
  groups: null as unknown,
}));

vi.mock('@/entities/course', async (importOriginal) => ({
  ...(await importOriginal<typeof CourseEntity>()),
  useTeacherCourse: () => hooks.course,
  useTeacherCourses: () => hooks.courses,
  useCreateCourse: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/entities/group', () => ({ useTeacherGroups: () => hooks.groups }));

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/teacher/courses" element={<TeacherCoursesPage />} />
            <Route path="/teacher/courses/:courseId" element={<TeacherCoursePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hooks.course = ready(course([]));
  hooks.courses = ready({ items: [] });
  hooks.groups = ready({ items: [] });
});

describe('TeacherCoursePage', () => {
  it('курс без модулей — пустое состояние, шапка остаётся', () => {
    renderAt(`/teacher/courses/${COURSE_ID}`);
    expect(screen.getByText('Черновик · v1')).toBeInTheDocument();
    expect(screen.getByText('В курсе пока нет модулей')).toBeInTheDocument();
  });

  it('модуль без блоков — подсказка вместо пустой карточки', () => {
    hooks.course = ready(
      course([{ id: id(0xd1), title: 'Введение', summary: null, order: 0, blocks: [] }]),
    );
    renderAt(`/teacher/courses/${COURSE_ID}`);
    expect(screen.getByText('Введение')).toBeInTheDocument();
    expect(screen.getByText('В модуле пока нет блоков')).toBeInTheDocument();
    expect(screen.queryByText('В курсе пока нет модулей')).not.toBeInTheDocument();
  });
});

describe('TeacherCoursesPage', () => {
  it('группы не загрузились — ошибка у поля и «Повторить»', async () => {
    const user = userEvent.setup();
    const groups = failed(new ApiClientError({ code: 'INTERNAL', message: 'x', status: 500 }));
    hooks.groups = groups;
    renderAt('/teacher/courses');

    expect(screen.getByRole('combobox', { name: /Группа/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(groups.refetch).toHaveBeenCalled();
  });
});
