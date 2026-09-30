/**
 * Главная ученика: расписание дня — неделя из `GET /student/home`, дни за её пределами (и дни,
 * которые `upcoming` покрывает не полностью из-за лимита 10) — из календаря месяца; сбой
 * календаря — ошибка с повтором; листание месяцев в шторке не сбрасывает выбранный день.
 */
import type { LessonDto, LessonsList, StudentHomeDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LessonEntity from '@/entities/lesson';
import type * as NotificationEntity from '@/entities/notification';
import '@/shared/i18n';
import { MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { StudentHomePage } from './ui/StudentHomePage';

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const teacher = {
  id: id(20),
  user: { id: id(10), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const robotics = {
  id: id(201),
  title: 'Робототехника, группа А',
  code: '001',
  club: { id: id(101), title: 'Робототехника', category: 'ROBOTICS' as const, coverUrl: null },
  teacher,
};

/** Занятие через `dayOffset` дней от «сегодня» (23.09.2026) в `hour`:00, полтора часа. */
function lesson(n: number, dayOffset: number, hour: number): LessonDto {
  const startsAt = new Date(2026, 8, 23 + dayOffset, hour, 0, 0, 0);
  return {
    id: id(300 + n),
    groupId: robotics.id,
    ruleId: null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
    topic: null,
    room: null,
    status: 'PLANNED',
    cancelReason: null,
    group: robotics,
    attendance: null,
  };
}

function studentHome(today: LessonDto[], upcoming: LessonDto[] = []): StudentHomeDto {
  return {
    today,
    upcoming,
    tasks: [],
    stats: {
      attendanceRate: null,
      completionRate: null,
      activityScore: 0,
      absences: 0,
      lateCount: 0,
      period: { from: '2026-08-24', to: '2026-09-23' },
    },
    clubs: [],
    aiComment: null,
  } as unknown as StudentHomeDto;
}

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

type Period = { from: string; to: string };

const hooks = vi.hoisted(() => ({
  home: null as unknown,
  calendar: vi.fn<(period: Period, options?: { enabled?: boolean }) => unknown>(),
}));

vi.mock('@/entities/dashboard', () => ({ useStudentHome: () => hooks.home }));
vi.mock('@/entities/lesson', async (importOriginal) => ({
  ...(await importOriginal<typeof LessonEntity>()),
  useStudentCalendar: (period: Period, options?: { enabled?: boolean }) =>
    hooks.calendar(period, options),
}));
vi.mock('@/entities/notification', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationEntity>()),
  useNotifications: () => ready({ items: [], unreadCount: 0 }),
}));

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };

function renderHome() {
  return render(
    <MaxBridgeProvider bridge={new MockMaxBridge({ launchParams: null })}>
      <ToastProvider>
        <MemoryRouter>
          <StudentHomePage />
        </MemoryRouter>
      </ToastProvider>
    </MaxBridgeProvider>,
  );
}

async function goForward(user: ReturnType<typeof userEvent.setup>, days: number) {
  for (let i = 0; i < days; i += 1) {
    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
  }
}

describe('StudentHomePage — расписание', () => {
  beforeEach(() => {
    // Только Date: «сейчас» — 23.09.2026 12:30, таймеры userEvent остаются настоящими.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 23, 12, 30));
    hooks.home = ready(studentHome([]));
    hooks.calendar.mockReset();
    hooks.calendar.mockImplementation((_period, options) =>
      options?.enabled ? ready<LessonsList>({ lessons: [] }) : pending(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('в колонке «Группа» — код группы', () => {
    hooks.home = ready(studentHome([lesson(1, 0, 16)]));
    renderHome();
    const table = screen.getByRole('table', { name: 'Сегодня' });
    expect(within(table).getByText('001')).toBeInTheDocument();
    expect(within(table).queryByText('Робототехника, группа А')).not.toBeInTheDocument();
  });

  it('«Отметиться по QR» — только пока сегодня есть занятие без отметки «был»', () => {
    hooks.home = ready(studentHome([lesson(1, 0, 16)]));
    const { unmount } = renderHome();
    expect(screen.getByRole('button', { name: 'Отметиться по QR' })).toBeInTheDocument();
    unmount();

    hooks.home = ready(
      studentHome([
        { ...lesson(1, 0, 10), attendance: 'PRESENT' },
        { ...lesson(2, 0, 16), status: 'CANCELLED' },
      ]),
    );
    const done = renderHome();
    expect(screen.queryByRole('button', { name: 'Отметиться по QR' })).not.toBeInTheDocument();
    done.unmount();

    hooks.home = ready(studentHome([]));
    renderHome();
    expect(screen.queryByRole('button', { name: 'Отметиться по QR' })).not.toBeInTheDocument();
  });

  it('сбой календаря на дне вне недели главной — ошибка с повтором, а не «нет занятий»', async () => {
    const user = userEvent.setup();
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

    await goForward(user, 7);
    expect(screen.queryByText('В этот день занятий нет')).not.toBeInTheDocument();
    expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('upcoming упёрся в лимит 10 — день последнего занятия и дальше берутся из календаря', async () => {
    const user = userEvent.setup();
    const upcoming = [
      ...Array.from({ length: 5 }, (_, i) => lesson(10 + i, 1, 9 + i)),
      ...Array.from({ length: 5 }, (_, i) => lesson(20 + i, 2, 9 + i)),
    ];
    hooks.home = ready(studentHome([], upcoming));
    hooks.calendar.mockImplementation((_period, options) =>
      options?.enabled
        ? ready<LessonsList>({ lessons: [...upcoming, lesson(30, 2, 18), lesson(31, 3, 10)] })
        : pending(),
    );
    renderHome();

    // Завтра целиком в `upcoming` — календарь не нужен.
    await goForward(user, 1);
    expect(hooks.calendar).not.toHaveBeenCalledWith(expect.anything(), { enabled: true });
    expect(within(screen.getByRole('table')).getAllByText('Робототехника')).toHaveLength(5);

    // Послезавтра `upcoming` может быть обрезан — занятие 18:00 приходит из календаря.
    await goForward(user, 1);
    expect(hooks.calendar).toHaveBeenCalledWith(SEPTEMBER, { enabled: true });
    expect(within(screen.getByRole('table')).getAllByText('Робототехника')).toHaveLength(6);

    await goForward(user, 1);
    expect(within(screen.getByRole('table')).getAllByText('Робототехника')).toHaveLength(1);
  });

  it('листание месяцев в шторке не сбрасывает загруженный день вне недели', async () => {
    const user = userEvent.setup();
    hooks.calendar.mockImplementation((period, options) => {
      if (!options?.enabled) return pending();
      return period.from === SEPTEMBER.from
        ? ready<LessonsList>({ lessons: [lesson(40, 7, 15)] })
        : pending();
    });
    renderHome();

    await goForward(user, 7);
    expect(screen.getByRole('table')).toHaveTextContent('Робототехника');

    await user.click(screen.getByRole('button', { name: 'Открыть календарь' }));
    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    // Октябрь ещё грузится, а расписание выбранного 30 сентября — на месте, без скелета.
    expect(hooks.calendar).toHaveBeenCalledWith(
      { from: '2026-10-01', to: '2026-10-31' },
      { enabled: true },
    );
    expect(screen.getByRole('table')).toHaveTextContent('Робототехника');
  });

  it('сбой месяца в шторке календаря — сообщение и «Повторить»', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Открыть календарь' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить расписание');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalled();
    // Сегодня покрыто главной — расписание под шторкой не падает в ошибку.
    expect(screen.getByText('Сегодня занятий нет')).toBeInTheDocument();
  });
});
