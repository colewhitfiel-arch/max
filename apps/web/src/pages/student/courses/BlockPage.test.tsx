/**
 * Шаг курса в плеере: TEXT — Markdown (без «#»/«**»), VIDEO открывается через MaxBridge.openLink
 * (а не голый URL текстом), тест — ответы и «Проверить» (сдача задания), разбор попытки,
 * задание — условие и форма сдачи прямо в плеере, «Дальше» засчитывает материал и ведёт дальше.
 */
import type { StudentBlockDetail, StudentCourseDetail } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import type * as AssignmentEntity from '@/entities/assignment';
import type * as CourseEntity from '@/entities/course';
import type * as SharedUi from '@/shared/ui';
import { BlockPage } from './ui/BlockPage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const hooks = vi.hoisted(() => ({
  block: null as unknown,
  course: null as unknown,
  assignment: null as unknown,
  complete: vi.fn(),
  submit: vi.fn(),
}));

vi.mock('@/entities/course', async (importOriginal) => ({
  // BlockContent — настоящий: тест проверяет именно то, что видит ученик в блоке.
  ...(await importOriginal<typeof CourseEntity>()),
  useStudentBlock: () => hooks.block,
  useStudentCourse: () => hooks.course,
  useOpenBlock: () => ({ mutate: () => undefined, isPending: false }),
  useCompleteBlock: () => ({ mutate: hooks.complete, isPending: false }),
}));
vi.mock('@/entities/assignment', async (importOriginal) => ({
  ...(await importOriginal<typeof AssignmentEntity>()),
  useStudentAssignment: () => hooks.assignment,
  useSubmitAssignment: () => ({ mutate: hooks.submit, isPending: false }),
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

const base = {
  id: id(1),
  moduleId: id(2),
  courseId: id(3),
  order: 0,
  title: 'Датчики',
  estimatedMinutes: null,
  isRequired: true,
  assignment: null,
  progress: { status: 'OPENED' },
};

/** Курс из двух шагов: текущий блок и следующий (группа — только то, что читает экран). */
const course = {
  id: id(3),
  title: 'Arduino',
  description: null,
  group: { id: id(8), title: 'Робототехника, группа А', code: '001' },
  modules: [
    {
      id: id(2),
      title: 'Датчики',
      order: 0,
      blocks: [
        {
          id: id(1),
          title: 'Датчики',
          type: 'TEXT',
          order: 0,
          estimatedMinutes: null,
          isRequired: true,
          progress: 'OPENED',
        },
        {
          id: id(5),
          title: 'Тест',
          type: 'QUIZ',
          order: 1,
          estimatedMinutes: null,
          isRequired: true,
          progress: null,
        },
      ],
    },
  ],
} as unknown as StudentCourseDetail;

const quizContent = {
  passScore: 60,
  questions: [
    {
      id: 'q1',
      text: 'Какой датчик измеряет расстояние?',
      options: [
        { id: 'a', text: 'Ультразвуковой' },
        { id: 'b', text: 'Температурный' },
      ],
      multiple: false,
    },
  ],
};

const assignmentBrief = {
  id: id(7),
  title: 'Тест по датчикам',
  type: 'QUIZ',
  dueAt: null,
  maxScore: 100,
  group: { id: id(8), title: 'Робототехника, группа А', code: '001' },
};

function renderBlock(bridge = new MockMaxBridge()) {
  return render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/student/blocks/${id(1)}`]}>
          <Routes>
            <Route path="/student/blocks/:blockId" element={<BlockPage />} />
            <Route path={`/student/blocks/${id(5)}`} element={<p>Следующий шаг</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </MaxBridgeProvider>,
  );
}

describe('BlockPage (плеер курса)', () => {
  beforeEach(() => {
    hooks.block = null;
    hooks.course = ready(course);
    hooks.assignment = ready(null);
    hooks.complete.mockReset();
    hooks.submit.mockReset();
  });

  it('VIDEO: «Открыть видео» открывает ссылку через MaxBridge, под кнопкой — домен', async () => {
    const user = userEvent.setup();
    const url = 'https://www.youtube.com/watch?v=abc';
    hooks.block = ready({
      ...base,
      type: 'VIDEO',
      content: { url, provider: 'youtube' },
    } as unknown as StudentBlockDetail);
    const bridge = new MockMaxBridge();
    const openLink = vi.spyOn(bridge, 'openLink').mockImplementation(() => undefined);
    renderBlock(bridge);

    expect(screen.queryByText(url)).not.toBeInTheDocument();
    expect(screen.getByText('www.youtube.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Открыть видео' }));
    expect(openLink).toHaveBeenCalledWith(url);
  });

  it('VIDEO без ссылки — «Видео недоступно»', () => {
    hooks.block = ready({
      ...base,
      type: 'VIDEO',
      content: { provider: 'file', fileId: id(9) },
    } as unknown as StudentBlockDetail);
    renderBlock();
    expect(screen.getByText('Видео недоступно')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть видео' })).not.toBeInTheDocument();
  });

  it('VIDEO со ссылкой не http(s) — «Видео недоступно», openLink не вызывается', () => {
    hooks.block = ready({
      ...base,
      type: 'VIDEO',
      content: { url: 'javascript:alert(1)', provider: 'youtube' },
    } as unknown as StudentBlockDetail);
    const bridge = new MockMaxBridge();
    const openLink = vi.spyOn(bridge, 'openLink').mockImplementation(() => undefined);
    renderBlock(bridge);
    expect(screen.getByText('Видео недоступно')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть видео' })).not.toBeInTheDocument();
    expect(openLink).not.toHaveBeenCalled();
  });

  it('TEXT: Markdown — заголовок и выделение, а не «#» и «**»; ссылка — через MaxBridge', async () => {
    const user = userEvent.setup();
    hooks.block = ready({
      ...base,
      type: 'TEXT',
      content: {
        markdown:
          '# Arduino\n\n**Arduino** — плата для *проектов*.\n\n- датчик\n- [документация](https://docs.arduino.cc)',
      },
    } as unknown as StudentBlockDetail);
    const bridge = new MockMaxBridge();
    const openLink = vi.spyOn(bridge, 'openLink').mockImplementation(() => undefined);
    renderBlock(bridge);

    // h1 — название блока в шапке, «#» урока — h2.
    expect(screen.getByRole('heading', { level: 2, name: 'Arduino' })).toBeInTheDocument();
    expect(screen.queryByText(/[#*]/)).not.toBeInTheDocument();
    expect(screen.getByText('проектов').tagName).toBe('EM');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('link', { name: 'документация' }));
    expect(openLink).toHaveBeenCalledWith('https://docs.arduino.cc/');
  });

  it('шаг и прогресс курса; «Дальше» засчитывает материал и открывает следующий шаг', async () => {
    const user = userEvent.setup();
    hooks.block = ready({
      ...base,
      type: 'TEXT',
      content: { markdown: 'Теория' },
    } as unknown as StudentBlockDetail);
    hooks.complete.mockImplementation((_vars, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    renderBlock();

    expect(screen.getByText('Шаг 1 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(hooks.complete).toHaveBeenCalledWith({ blockId: id(1), body: {} }, expect.anything());
    expect(screen.getByText('Следующий шаг')).toBeInTheDocument();
  });

  it('QUIZ-задание: вопросы с вариантами, «Проверить» — только когда отвечено всё, сдача ответов', async () => {
    const user = userEvent.setup();
    hooks.block = ready({
      ...base,
      type: 'QUIZ',
      content: quizContent,
      assignment: assignmentBrief,
    } as unknown as StudentBlockDetail);
    renderBlock();

    const check = screen.getByRole('button', { name: 'Проверить ответы' });
    expect(check).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Ультразвуковой' }));
    expect(check).toBeEnabled();
    await user.click(check);
    expect(hooks.submit).toHaveBeenCalledWith({ answers: { q1: ['a'] } }, expect.anything());
    // До сдачи теста «Дальше» — пропуск шага, а не прохождение.
    expect(screen.getByRole('button', { name: 'Пропустить' })).toBeInTheDocument();
  });

  it('QUIZ без задания: ответы засчитываются напрямую (complete с ответами)', async () => {
    const user = userEvent.setup();
    hooks.block = ready({
      ...base,
      type: 'QUIZ',
      content: quizContent,
    } as unknown as StudentBlockDetail);
    renderBlock();
    await user.click(screen.getByRole('radio', { name: 'Температурный' }));
    await user.click(screen.getByRole('button', { name: 'Проверить ответы' }));
    expect(hooks.complete).toHaveBeenCalledWith(
      { blockId: id(1), body: { answers: { q1: ['b'] } } },
      expect.anything(),
    );
  });

  it('разбор попытки: балл, «не пройден», верный ответ скрыт до верного ответа, «Пройти ещё раз»', async () => {
    const user = userEvent.setup();
    hooks.block = ready({
      ...base,
      type: 'QUIZ',
      content: quizContent,
      assignment: assignmentBrief,
      progress: { status: 'COMPLETED', attempts: 1, score: 0 },
      quizReview: {
        score: 0,
        passScore: 60,
        passed: false,
        questions: [{ questionId: 'q1', correct: false, pickedOptionIds: ['b'] }],
      },
    } as unknown as StudentBlockDetail);
    renderBlock();

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Нужно не меньше 60%')).toBeInTheDocument();
    expect(screen.getByText('Неверно')).toBeInTheDocument();
    expect(screen.getByText(/правильный ответ откроется/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));
    expect(screen.getByRole('button', { name: 'Проверить ответы' })).toBeDisabled();
  });

  it('HOMEWORK-задание: условие и форма сдачи прямо в плеере', () => {
    hooks.block = ready({
      ...base,
      type: 'HOMEWORK',
      content: { instructions: 'Собери схему', submissionType: 'TEXT' },
      assignment: { ...assignmentBrief, type: 'HOMEWORK', title: 'ДЗ: схема' },
    } as unknown as StudentBlockDetail);
    hooks.assignment = ready({
      ...assignmentBrief,
      type: 'HOMEWORK',
      title: 'ДЗ: схема',
      description: null,
      block: { id: id(1), courseId: id(3) },
      submission: null,
      attemptsLeft: null,
    });
    renderBlock();

    expect(screen.getByText('Собери схему')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Твой ответ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сдать' })).toBeDisabled();
  });
});
