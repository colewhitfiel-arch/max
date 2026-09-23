/**
 * Блок курса ученика: VIDEO открывается через MaxBridge.openLink (а не голый URL текстом),
 * задание блока — строкой списка с полным названием, типом и сроком.
 */
import type { StudentBlockDetail } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import type * as CourseEntity from '@/entities/course';
import type * as SharedUi from '@/shared/ui';
import { BlockPage } from './ui/BlockPage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const hooks = vi.hoisted(() => ({
  block: null as unknown,
  mutation: { mutate: () => undefined, isPending: false },
}));

vi.mock('@/entities/course', async (importOriginal) => ({
  // BlockContent — настоящий: тест проверяет именно то, что видит ученик в блоке.
  ...(await importOriginal<typeof CourseEntity>()),
  useStudentBlock: () => hooks.block,
  useOpenBlock: () => hooks.mutation,
  useCompleteBlock: () => hooks.mutation,
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

function renderBlock(bridge = new MockMaxBridge()) {
  return render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/student/blocks/${id(1)}`]}>
          <Routes>
            <Route path="/student/blocks/:blockId" element={<BlockPage />} />
            <Route path="/student/assignments/:id" element={<p>Экран задания</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </MaxBridgeProvider>,
  );
}

describe('BlockPage', () => {
  beforeEach(() => {
    hooks.block = null;
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

  it('QUIZ без правильных ответов (вариант для ученика) — вопросы показаны', () => {
    hooks.block = ready({
      ...base,
      type: 'QUIZ',
      content: {
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
      },
    } as unknown as StudentBlockDetail);
    renderBlock();
    expect(screen.getByText('1. Какой датчик измеряет расстояние?')).toBeInTheDocument();
  });

  it('HOMEWORK: задание — строкой с полным названием и типом, открывает экран задания', async () => {
    const user = userEvent.setup();
    hooks.block = ready({
      ...base,
      type: 'HOMEWORK',
      content: { instructions: 'Собери схему' },
      assignment: {
        id: id(7),
        title: 'Домашнее задание: схема с датчиком расстояния',
        type: 'HOMEWORK',
        dueAt: null,
        maxScore: 10,
        group: { id: id(8), title: 'Робототехника, группа А', code: '001' },
      },
    } as unknown as StudentBlockDetail);
    renderBlock();

    const row = screen.getByRole('button', { name: /схема с датчиком/ });
    expect(row).toHaveTextContent('Домашнее задание · Без срока');
    await user.click(row);
    expect(screen.getByText('Экран задания')).toBeInTheDocument();
  });
});
