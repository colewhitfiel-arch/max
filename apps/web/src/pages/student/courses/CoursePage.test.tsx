/** Курс ученика: доступный статус блока и пустые состояния курса/модуля. */
import type { StudentCourseDetail } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import type * as SharedUi from '@/shared/ui';
import { CoursePage } from './ui/CoursePage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const hooks = vi.hoisted(() => ({ course: null as unknown }));

vi.mock('@/entities/course', () => ({ useStudentCourse: () => hooks.course }));
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

const block = (n: number, progress: string | null) => ({
  id: id(100 + n),
  title: `Блок ${n}`,
  type: 'TEXT',
  estimatedMinutes: null,
  isRequired: false,
  progress,
});

function course(modules: unknown[]) {
  return ready({
    id: id(1),
    title: 'Основы робототехники',
    description: null,
    group: { id: id(2), title: 'Робототехника, группа А', code: '001' },
    modules,
  } as unknown as StudentCourseDetail);
}

function renderCourse() {
  return render(
    <MemoryRouter initialEntries={[`/student/courses/${id(1)}`]}>
      <Routes>
        <Route path="/student/courses/:courseId" element={<CoursePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CoursePage', () => {
  it('статус блока озвучивается текстом; модуль без блоков — подпись вместо пустой карточки', () => {
    hooks.course = course([
      { id: id(10), title: 'Модуль 1', blocks: [block(1, 'COMPLETED'), block(2, 'OPENED')] },
      { id: id(11), title: 'Модуль 2', blocks: [] },
    ]);
    renderCourse();
    expect(screen.getByRole('img', { name: 'Блок завершён' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Блок открыт' })).toBeInTheDocument();
    expect(screen.getByText('В модуле пока нет блоков')).toBeInTheDocument();
  });

  it('курс без блоков — пустое состояние', () => {
    hooks.course = course([]);
    renderCourse();
    expect(screen.getByText('В курсе пока нет материалов')).toBeInTheDocument();
  });
});
