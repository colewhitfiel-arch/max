/**
 * Главная репетитора: шапка с кошельком (→ кошелёк), иллюстрация и расписание дня по всем
 * группам — код группы, подсветка текущего занятия, «зебра», дни вне недели из календаря.
 */
import {
  type LessonDto,
  type LessonsList,
  type MeDto,
  type TeacherHomeDto,
  TeacherHomeDtoSchema,
} from '@edu/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LessonEntity from '@/entities/lesson';
import type * as NotificationEntity from '@/entities/notification';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import '@/shared/i18n';
import { TeacherHomePage } from './ui/TeacherHomePage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const teacher = {
  id: id(20),
  user: { id: id(10), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const club = (n: number, title: string) => ({
  id: id(100 + n),
  title,
  category: 'OTHER' as const,
  coverUrl: null,
});
const robotics = {
  id: id(201),
  title: 'Робототехника, группа А',
  code: '001',
  club: club(1, 'Робототехника'),
  teacher,
};
const chinese = {
  id: id(202),
  title: 'Китайский, группа Б',
  code: '012',
  club: club(2, 'Китайский'),
  teacher,
};
// Группа без кода: в колонке «Группа» — её название.
const chess = {
  id: id(203),
  title: 'Шахматы, группа В',
  code: null,
  club: club(3, 'Шахматы'),
  teacher,
};

type Group = typeof robotics | typeof chinese | typeof chess;

/** Занятие через `dayOffset` дней от «сегодня» (23.09.2026) в `hour`:00, полтора часа. */
function lesson(n: number, group: Group, dayOffset: number, hour: number): LessonDto {
  const startsAt = new Date(2026, 8, 23 + dayOffset, hour, 0, 0, 0);
  return {
    id: id(300 + n),
    groupId: group.id,
    ruleId: null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
    topic: null,
    room: null,
    status: 'PLANNED',
    cancelReason: null,
    group,
    attendance: null,
  };
}

function teacherHome(today: LessonDto[], upcoming: LessonDto[] = []): TeacherHomeDto {
  return TeacherHomeDtoSchema.parse({
    today,
    upcoming,
    groups: [],
    toGrade: [],
    events: [],
    stats: {
      groupsCount: 3,
      studentsCount: 5,
      avgAttendanceRate: 0.9,
      avgCompletionRate: 0.5,
      needsAttentionCount: 0,
    },
  });
}

const maria: MeDto = {
  user: teacher.user,
  roles: ['TEACHER', 'PARENT'],
  activeRole: 'TEACHER',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: null,
  teacher: { id: teacher.id, schoolId: id(1) },
};

const ready = <T,>(data: T) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});
const pending = () => ({
  data: undefined,
  error: null,
  isPending: true,
  isError: false,
  isSuccess: false,
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({
  home: null as unknown,
  wallet: null as unknown,
  calendar:
    vi.fn<(period: { from: string; to: string }, options?: { enabled?: boolean }) => unknown>(),
}));

vi.mock('@/entities/dashboard', () => ({ useTeacherHome: () => hooks.home }));
vi.mock('@/entities/payment', () => ({ useTeacherWallet: () => hooks.wallet }));
vi.mock('@/entities/lesson', async (importOriginal) => ({
  ...(await importOriginal<typeof LessonEntity>()),
  useTeacherCalendar: (period: { from: string; to: string }, options?: { enabled?: boolean }) =>
    hooks.calendar(period, options),
}));
vi.mock('@/entities/notification', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationEntity>()),
  useNotifications: () => ready({ items: [], unreadCount: 5 }),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </output>
  );
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/teacher']}>
      <Routes>
        <Route path="/teacher" element={<TeacherHomePage />} />
        <Route path="/teacher/wallet" element={<p>кошелёк</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('TeacherHomePage', () => {
  beforeEach(() => {
    // Только Date: «сейчас» — 23.09.2026 12:30, таймеры userEvent остаются настоящими.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 23, 12, 30));
    useAuthStore.setState({ status: 'authenticated', me: maria });
    hooks.home = ready(teacherHome([]));
    hooks.wallet = ready({ balance: { amountKopecks: 670_000, currency: 'RUB' } });
    hooks.calendar.mockReset();
    hooks.calendar.mockImplementation((_period, options) =>
      options?.enabled ? ready<LessonsList>({ lessons: [] }) : pending(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAuthStore();
  });

  it('шапка: имя и кошелёк «6700» без плюса — чип открывает кошелёк из приложения', async () => {
    const user = userEvent.setup();
    const { container } = renderHome();

    expect(screen.getByRole('heading', { level: 1, name: 'Главная' })).toBeInTheDocument();
    expect(screen.getByText('Иванова М.')).toBeInTheDocument();
    // Иллюстрация декоративная — скринридер её пропускает.
    const art = container.querySelector('img');
    expect(art).toHaveAttribute('alt', '');
    expect(art).toHaveAttribute('aria-hidden', 'true');
    expect(art?.getAttribute('src')).toMatch(/tutor-dashboard/);

    const chip = screen.getByRole('button', { name: /^Баланс 6\s700\s₽, открыть кошелёк$/ });
    expect(chip).toHaveTextContent(/^6700$/);
    expect(chip.querySelectorAll('svg')).toHaveLength(1); // только кошелёк, без «+»

    await user.click(chip);
    const location = screen.getByTestId('location');
    expect(location).toHaveTextContent('/teacher/wallet');
    expect(location).toHaveAttribute('data-state', JSON.stringify({ fromApp: true }));
  });

  it('кошелёк ещё грузится: вместо суммы многоточие, чип всё равно открывает кошелёк', async () => {
    const user = userEvent.setup();
    hooks.wallet = pending();
    renderHome();

    const chip = screen.getByRole('button', { name: 'Открыть кошелёк' });
    expect(chip).toHaveTextContent('…');
    await user.click(chip);
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/wallet');
  });

  it('баланс не загрузился: прочерк и подпись об ошибке, чип открывает кошелёк (повтор)', async () => {
    const user = userEvent.setup();
    hooks.wallet = { ...pending(), isPending: false, isError: true, error: new Error('x') };
    renderHome();

    const chip = screen.getByRole('button', { name: 'Баланс не загрузился, открыть кошелёк' });
    expect(chip).toHaveTextContent('—');
    await user.click(chip);
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/wallet');
  });

  it('расписание сегодня: код группы (без кода — название), текущее занятие выделено, «зебра»', () => {
    hooks.home = ready(
      teacherHome([lesson(1, robotics, 0, 12), lesson(2, chinese, 0, 14), lesson(3, chess, 0, 16)]),
    );
    renderHome();

    expect(screen.getByRole('button', { name: 'Уведомления: 5 непрочитанных' })).toBeVisible();
    const table = screen.getByRole('table', { name: 'Сегодня' });
    for (const text of ['Название', 'Группа', 'Время', 'Робототехника', 'Китайский', 'Шахматы']) {
      expect(within(table).getByText(text)).toBeInTheDocument();
    }
    expect(within(table).getByText('001')).toBeInTheDocument();
    expect(within(table).getByText('012')).toBeInTheDocument();
    expect(within(table).getByText('Шахматы, группа В')).toBeInTheDocument();

    // Идёт занятие 12:00–13:30 — оно и подсвечено (цвет акцента), остальные — обычные.
    const times = within(table).getAllByText(/^\d{2}:\d{2}/);
    expect(times.map((time) => time.getAttribute('data-tone'))).toEqual([
      'primary',
      'default',
      'default',
    ]);

    // Полосой подложены 1-я и 3-я строки — во всех трёх колонках.
    const striped = within(table)
      .getAllByRole('cell')
      .filter((cell) => cell.hasAttribute('data-stripe'));
    expect(striped).toHaveLength(6);
    expect(striped.map((cell) => cell.textContent)).toEqual(
      expect.arrayContaining(['Робототехника', 'Шахматы', '001', 'Шахматы, группа В']),
    );

    // Календарь не нужен, пока день — в пределах главной.
    expect(hooks.calendar).toHaveBeenLastCalledWith(
      { from: '2026-09-01', to: '2026-09-30' },
      { enabled: false },
    );
  });

  it('дни, которые главная покрывает не полностью, берутся из календаря', async () => {
    const user = userEvent.setup();
    // `upcoming` обрывается на послезавтра: завтра покрыто главной, послезавтра — уже календарь.
    hooks.home = ready(teacherHome([], [lesson(4, robotics, 2, 10)]));
    hooks.calendar.mockImplementation((_period, options) =>
      options?.enabled
        ? ready<LessonsList>({ lessons: [lesson(4, robotics, 2, 10), lesson(5, chess, 2, 17)] })
        : pending(),
    );
    renderHome();
    expect(screen.getByText('Сегодня занятий нет')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText('Завтра')).toBeInTheDocument();
    expect(screen.getByText('В этот день занятий нет')).toBeInTheDocument();
    expect(hooks.calendar).toHaveBeenLastCalledWith(expect.anything(), { enabled: false });

    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(hooks.calendar).toHaveBeenLastCalledWith(
      { from: '2026-09-01', to: '2026-09-30' },
      { enabled: true },
    );
    const table = screen.getByRole('table');
    expect(within(table).getByText('001')).toBeInTheDocument();
    expect(within(table).getByText('Шахматы, группа В')).toBeInTheDocument();
  });

  it('сбой календаря на дне вне главной — ошибка с повтором, а не «нет занятий»', async () => {
    const user = userEvent.setup();
    // `upcoming` кончается завтра: завтра уже частично из календаря.
    hooks.home = ready(teacherHome([], [lesson(4, robotics, 1, 10)]));
    const refetch = vi.fn();
    hooks.calendar.mockImplementation((_period, options) =>
      options?.enabled
        ? {
            data: undefined,
            error: new Error('сеть'),
            isPending: false,
            isError: true,
            isSuccess: false,
            refetch,
          }
        : pending(),
    );
    renderHome();
    expect(screen.getByText('Сегодня занятий нет')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText('Завтра')).toBeInTheDocument();
    // Ни неполного списка из `upcoming`, ни ложного «нет занятий».
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('В этот день занятий нет')).not.toBeInTheDocument();
    expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalled();

    // Вернуться на «Сегодня» можно: строка дня осталась.
    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }));
    expect(screen.getByText('Сегодня занятий нет')).toBeInTheDocument();
  });

  it('состояния расписания: загрузка — скелет, ошибка — «Повторить» перезапрашивает', async () => {
    const user = userEvent.setup();
    hooks.home = pending();
    const { container, unmount } = renderHome();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Шапка от расписания не зависит.
    expect(screen.getByRole('button', { name: /открыть кошелёк/ })).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    hooks.home = {
      data: undefined,
      error: new Error('сеть'),
      isPending: false,
      isError: true,
      isSuccess: false,
      refetch,
    };
    renderHome();
    expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalled();
  });
});
