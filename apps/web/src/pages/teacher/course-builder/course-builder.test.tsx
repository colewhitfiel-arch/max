/**
 * Конструктор курса: форма запуска (короткое дополнение к материалам, ошибка загрузки групп),
 * «назад» в настройки, экран задачи — вкладка базы знаний до появления черновика, превью блоков
 * через i18n, тон бейджа отменённой задачи.
 */
import {
  GenerationJobDtoSchema,
  TeacherGroupsListSchema,
  type GenerationJobDto,
} from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GenerationEntity from '@/entities/generation';
import { ApiClientError } from '@/shared/api/errors';
import '@/shared/i18n';
import { CourseBuilderPage } from './ui/CourseBuilderPage';
import { GenerationJobPage } from './ui/GenerationJobPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const JOB_ID = id(0xb1);
const NOW = '2026-09-23T10:00:00.000Z';

const knowledge = {
  atoms: [{ id: 1, text: 'Цикл for перебирает элементы' }],
  nodes: [
    {
      id: 'n1',
      title: 'Цикл for',
      statement: 'for перебирает последовательность',
      type: 'CONCEPT',
      atomIds: [1],
      importance: 3,
      misconceptions: [],
    },
  ],
  plan: [{ title: 'Циклы', nodeIds: ['n1'] }],
  stats: { atomsTotal: 1, atomsCited: 1, coverage: 1, nodesRejected: 0 },
};

const draft = {
  title: 'Циклы в Python',
  modules: [
    {
      title: 'Циклы',
      blocks: [
        {
          type: 'TEXT',
          title: 'Теория',
          content: { markdown: '## Цикл `for`\n\n**Цикл** перебирает *последовательность*.' },
        },
        {
          type: 'QUIZ',
          title: 'Проверка',
          content: {
            passScore: 60,
            questions: [1, 2].map((n) => ({
              id: `q${n}`,
              text: `Вопрос ${n}`,
              options: [
                { id: 'a', text: 'A' },
                { id: 'b', text: 'B' },
              ],
              correctOptionIds: ['a'],
              multiple: false,
            })),
          },
        },
        {
          type: 'INTERACTIVE',
          title: 'Карточки',
          content: {
            kind: 'FLASHCARDS',
            data: {
              cards: [1, 2, 3, 4, 5].map((n) => ({ front: `F${n}`, back: `B${n}` })),
            },
          },
        },
      ],
    },
  ],
};

function job(overrides: Partial<Record<keyof GenerationJobDto, unknown>> = {}): GenerationJobDto {
  return GenerationJobDtoSchema.parse({
    id: JOB_ID,
    teacherId: id(0xf1),
    groupId: id(0xa1),
    courseId: null,
    materials: [],
    instructions: null,
    targetTitle: 'Циклы',
    sourceKind: 'TOPIC',
    topic: 'Циклы for и while в Python',
    knowledge: null,
    stage: 'QUEUED',
    progress: 0,
    draft: null,
    error: null,
    createdAt: NOW,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  });
}

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

const mutation = () => ({ mutate: vi.fn(), isPending: false });

const hooks = vi.hoisted(() => ({
  job: null as unknown,
  jobs: null as unknown,
  groups: null as unknown,
}));

vi.mock('@/entities/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof GenerationEntity>()),
  useGenerationJob: () => hooks.job,
  useGenerationJobs: () => hooks.jobs,
  useCreateGenerationJob: () => mutation(),
  useAcceptGenerationJob: () => mutation(),
  useCancelGenerationJob: () => mutation(),
}));
vi.mock('@/entities/group', () => ({ useTeacherGroups: () => hooks.groups }));

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
            <Route path="/teacher/course-builder" element={<CourseBuilderPage />} />
            <Route path="/teacher/course-builder/:jobId" element={<GenerationJobPage />} />
            <Route path="/teacher/settings" element={<p>Настройки</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hooks.job = ready(job());
  hooks.jobs = ready({ items: [], nextCursor: null });
  hooks.groups = ready(
    TeacherGroupsListSchema.parse({
      items: [],
    }),
  );
});

describe('CourseBuilderPage', () => {
  it('«назад» ведёт на экран заданий — единственную точку входа', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/course-builder');
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('location').textContent).toBe('/teacher/assignments');
  });

  it('переключатель режима подписан', () => {
    renderAt('/teacher/course-builder');
    expect(screen.getByRole('radiogroup', { name: 'Источник курса' })).toBeInTheDocument();
  });

  it('короткое дополнение к материалам — ошибка у поля', async () => {
    const user = userEvent.setup();
    renderAt('/teacher/course-builder');
    await user.click(screen.getByRole('radio', { name: 'Из конспекта' }));
    expect(screen.getByText('Если заполняете — минимум 10 символов')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Дополнение к материалам (необязательно)'), 'коротко');
    expect(screen.getByText(/Слишком коротко/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сгенерировать курс' })).toBeDisabled();
  });

  it('группы не загрузились — ошибка у поля и «Повторить»', async () => {
    const user = userEvent.setup();
    const groups = failed(new ApiClientError({ code: 'INTERNAL', message: 'x', status: 500 }));
    hooks.groups = groups;
    renderAt('/teacher/course-builder');

    expect(screen.getByRole('combobox', { name: /Группа/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(groups.refetch).toHaveBeenCalled();
  });
});

describe('GenerationJobPage', () => {
  it('пока черновика нет — открыта база знаний', () => {
    hooks.job = ready(job({ stage: 'GENERATING', progress: 60, knowledge }));
    renderAt(`/teacher/course-builder/${JOB_ID}`);

    expect(screen.getByRole('tab', { name: 'База знаний' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Атомы и узлы знаний')).toBeInTheDocument();
  });

  it('превью блоков черновика — через i18n', () => {
    hooks.job = ready(job({ stage: 'READY', progress: 100, knowledge, draft }));
    renderAt(`/teacher/course-builder/${JOB_ID}`);

    expect(screen.getByRole('tab', { name: 'Черновик курса' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('2 вопр.')).toBeInTheDocument();
    expect(screen.getByText('5 карточек')).toBeInTheDocument();
    // Текст урока — без разметки Markdown.
    expect(screen.getByText('Цикл for Цикл перебирает последовательность.')).toBeInTheDocument();
  });

  it('отменённая задача — нейтральный бейдж, не «успех»', () => {
    hooks.job = ready(job({ stage: 'CANCELLED', progress: 40 }));
    renderAt(`/teacher/course-builder/${JOB_ID}`);

    expect(screen.getByText('40%')).toHaveAttribute('data-tone', 'neutral');
  });
});
