/**
 * Экран задания у ученика: условие берётся из блока курса, ответ отправляется в
 * `POST /student/assignments/:id/submit`. Тест закрывает главную жалобу «дз не открываются»:
 * тап по планете ведёт сюда, и здесь должно быть что делать.
 */
import type { StudentAssignmentDetail, StudentBlockDetail } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AssignmentEntity from '@/entities/assignment';
import type * as CourseEntity from '@/entities/course';
import '@/shared/i18n';
import type * as SharedUi from '@/shared/ui';
import { AssignmentPage } from './ui/AssignmentPage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const hooks = vi.hoisted(() => ({
  assignment: null as unknown,
  block: null as unknown,
  submit: vi.fn(),
  isPending: false,
}));

vi.mock('@/entities/assignment', async (importOriginal) => ({
  ...(await importOriginal<typeof AssignmentEntity>()),
  useStudentAssignment: () => hooks.assignment,
  useSubmitAssignment: () => ({ mutate: hooks.submit, isPending: hooks.isPending }),
}));
vi.mock('@/entities/course', async (importOriginal) => ({
  ...(await importOriginal<typeof CourseEntity>()),
  useStudentBlock: () => hooks.block,
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedUi>()),
  ScreenHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});
const idle = { data: undefined, error: null, isPending: false, isError: false, refetch: vi.fn() };

const teacher = {
  id: id(20),
  user: { id: id(10), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const group = {
  id: id(201),
  title: 'Робототехника, группа А',
  code: null,
  club: { id: id(101), title: 'Робототехника', category: 'ROBOTICS' as const, coverUrl: null },
  teacher,
};

function assignment(patch: Partial<StudentAssignmentDetail> = {}): StudentAssignmentDetail {
  return {
    id: id(1),
    title: 'Проверь себя: датчики',
    type: 'QUIZ',
    dueAt: null,
    maxScore: 100,
    group,
    submission: null,
    description: null,
    block: { id: id(2), courseId: id(3) },
    attemptsLeft: null,
    ...patch,
  };
}

const quizBlock: StudentBlockDetail = {
  id: id(2),
  moduleId: id(4),
  courseId: id(3),
  order: 0,
  title: 'Проверь себя: датчики',
  estimatedMinutes: null,
  isRequired: true,
  type: 'QUIZ',
  content: {
    passScore: 60,
    questions: [
      {
        id: 'q1',
        text: 'Что измеряет HC-SR04?',
        multiple: false,
        options: [
          { id: 'a', text: 'Расстояние' },
          { id: 'b', text: 'Температуру' },
        ],
      },
    ],
  },
  assignment: null,
  progress: null,
};

const homeworkBlock: StudentBlockDetail = {
  ...quizBlock,
  type: 'HOMEWORK',
  title: 'Схема с датчиком',
  content: { instructions: 'Нарисуй схему и сфотографируй.', submissionType: 'TEXT' },
};

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/student/assignments/${id(1)}`]}>
        <Routes>
          <Route path="/student/assignments/:assignmentId" element={<AssignmentPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AssignmentPage', () => {
  beforeEach(() => {
    hooks.submit = vi.fn();
    hooks.isPending = false;
    hooks.block = idle;
  });

  it('QUIZ: вопросы блока видны, ответ уходит в сдачу', async () => {
    hooks.assignment = ready(assignment());
    hooks.block = ready(quizBlock);
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(/Что измеряет HC-SR04\?/)).toBeVisible();
    const submit = screen.getByRole('button', { name: 'Сдать' });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Расстояние' }));
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(hooks.submit).toHaveBeenCalledWith(
      { answers: { q1: ['a'] } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('HOMEWORK с текстовой сдачей: условие видно, текст уходит в сдачу', async () => {
    hooks.assignment = ready(assignment({ type: 'HOMEWORK', title: 'Схема с датчиком' }));
    hooks.block = ready(homeworkBlock);
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('Нарисуй схему и сфотографируй.')).toBeVisible();
    await user.type(screen.getByRole('textbox'), 'Готово, фото в чате');
    await user.click(screen.getByRole('button', { name: 'Сдать' }));

    expect(hooks.submit).toHaveBeenCalledWith(
      { text: 'Готово, фото в чате' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('попытки закончились: формы нет', () => {
    hooks.assignment = ready(assignment({ attemptsLeft: 0 }));
    hooks.block = ready(quizBlock);
    renderPage();

    expect(screen.getByText('Попытки закончились')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Сдать' })).toBeNull();
  });

  it('проверенная работа: балл и комментарий преподавателя видны, можно сдать заново', () => {
    hooks.assignment = ready(
      assignment({
        type: 'HOMEWORK',
        submission: {
          id: id(9),
          assignmentId: id(1),
          studentId: id(8),
          status: 'GRADED',
          attemptsCount: 1,
          score: 90,
          fileIds: [],
          text: 'Моя схема',
          submittedAt: '2026-09-20T10:00:00.000Z',
          gradedAt: '2026-09-21T10:00:00.000Z',
          gradedById: teacher.id,
          feedback: 'Аккуратно, молодец',
          isLate: false,
        },
      }),
    );
    hooks.block = ready(homeworkBlock);
    renderPage();

    expect(screen.getByText(/90/)).toBeVisible();
    expect(screen.getByText(/Аккуратно, молодец/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Сдать заново' })).toBeVisible();
  });
});
