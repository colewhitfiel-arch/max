/**
 * Посещаемость: выбор занятия (сегодня → ждут отметки → ближайшие) и лист отметки
 * (по умолчанию все «Был», массовые действия, сохранение всего листа разом).
 */
import { AttendanceSheetSchema, type LessonDto, LessonsListSchema } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type * as LessonEntity from '@/entities/lesson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { AttendanceLessonsPage } from './ui/AttendanceLessonsPage';
import { AttendanceSheetPage } from './ui/AttendanceSheetPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LESSON_ID = id(0x70);

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
const group = { id: id(0x40), title: 'Робототехника, А', code: null, club, teacher };

const student = (n: number, firstName: string) => ({
  id: id(n),
  classLabel: '6А',
  user: { id: id(n + 100), firstName, lastName: null, nickname: null, avatarUrl: null },
});

/** Занятие с началом через `hoursFromNow` часов (отрицательное — уже прошло). */
function lesson(overrides: Partial<LessonDto> & { hoursFromNow: number }): LessonDto {
  const { hoursFromNow, ...rest } = overrides;
  const startsAt = new Date(Date.now() + hoursFromNow * 3_600_000);
  return {
    id: LESSON_ID,
    groupId: group.id,
    ruleId: null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
    topic: 'Датчики',
    room: null,
    status: 'PLANNED',
    cancelReason: null,
    group,
    ...rest,
  };
}

const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({
  calendar: null as unknown,
  sheet: null as unknown,
  mark: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/entities/lesson', async (importOriginal) => ({
  ...(await importOriginal<typeof LessonEntity>()),
  useTeacherCalendar: () => hooks.calendar,
  useAttendanceSheet: () => hooks.sheet,
  useMarkAttendance: () => hooks.mark,
}));

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <Routes>
          <Route path="/teacher/attendance" element={<AttendanceLessonsPage />} />
          <Route path="/teacher/attendance/:lessonId" element={<AttendanceSheetPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Лист по умолчанию: нужен и тем тестам, которые просто переходят на экран отметки. */
const sheetOf = (rows: Array<{ student: ReturnType<typeof student>; status: string | null }>) =>
  AttendanceSheetSchema.parse({
    lesson: lesson({ hoursFromNow: -1 }),
    rows: rows.map((row) => ({ ...row, comment: null })),
  });

beforeEach(() => {
  hooks.mark = { mutate: vi.fn(), isPending: false };
  hooks.sheet = ready(
    sheetOf([
      { student: student(0x21, 'Алексей'), status: null },
      { student: student(0x22, 'Даша'), status: null },
    ]),
  );
});

describe('Посещаемость преподавателя', () => {
  it('занятия разложены по важности: сегодня, ждут отметки, ближайшие', async () => {
    const user = userEvent.setup();
    hooks.calendar = ready(
      LessonsListSchema.parse({
        lessons: [
          lesson({ hoursFromNow: -1 }),
          lesson({ id: id(0x71), hoursFromNow: -72, topic: 'Старое занятие' }),
          lesson({ id: id(0x72), hoursFromNow: 72, topic: 'Будущее занятие' }),
          // Отменённое занятие в списке не участвует: отмечать по нему нечего.
          lesson({ id: id(0x73), hoursFromNow: -2, status: 'CANCELLED', topic: 'Отменено' }),
        ],
      }),
    );
    renderAt('/teacher/attendance');

    expect(screen.getByText('Сегодня')).toBeInTheDocument();
    expect(screen.getByText('Ждут отметки')).toBeInTheDocument();
    expect(screen.getByText('Ближайшие')).toBeInTheDocument();
    expect(screen.queryByText(/Отменено/)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Робототехника, А/ })[0]!);
    expect(screen.getByTestId('location')).toHaveTextContent(`/teacher/attendance/${LESSON_ID}`);
  });

  it('по умолчанию все «Был»; меняем одного и сохраняем весь лист', async () => {
    const user = userEvent.setup();
    renderAt(`/teacher/attendance/${LESSON_ID}`);

    // Сводка считает всех присутствующими, пока преподаватель не сказал иначе.
    expect(screen.getByText('Были: 2')).toBeInTheDocument();

    const dasha = screen.getByRole('radiogroup', { name: 'Даша' });
    await user.click(within(dasha).getByRole('radio', { name: 'Не был' }));
    expect(screen.getByText('Были: 1')).toBeInTheDocument();
    expect(screen.getByText('Не были: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(hooks.mark.mutate).toHaveBeenCalledWith(
      {
        rows: [
          { studentId: id(0x21), status: 'PRESENT' },
          { studentId: id(0x22), status: 'ABSENT' },
        ],
      },
      expect.anything(),
    );
  });

  it('«Никого не было» проставляет всем ABSENT', async () => {
    const user = userEvent.setup();
    renderAt(`/teacher/attendance/${LESSON_ID}`);

    await user.click(screen.getByRole('button', { name: 'Никого не было' }));
    expect(screen.getByText('Не были: 2')).toBeInTheDocument();
  });

  it('уже проставленные отметки сохраняются, а не сбрасываются в «Был»', () => {
    hooks.sheet = ready(
      AttendanceSheetSchema.parse({
        lesson: lesson({ hoursFromNow: -24, status: 'DONE' }),
        rows: [
          { student: student(0x21, 'Алексей'), status: 'LATE', comment: null },
          { student: student(0x22, 'Даша'), status: null, comment: null },
        ],
      }),
    );
    renderAt(`/teacher/attendance/${LESSON_ID}`);

    expect(screen.getByText('Опоздали: 1')).toBeInTheDocument();
    expect(screen.getByText('Были: 1')).toBeInTheDocument();
  });
});
