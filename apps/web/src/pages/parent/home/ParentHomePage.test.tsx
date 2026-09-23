import type { ChildrenList } from '@edu/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StudentEntity from '@/entities/student';
import '@/shared/i18n';
import { useUiStore } from '@/shared/store/ui-store';
import { ParentHomePage } from './ui/ParentHomePage';

const EGOR = '0190a000-0000-7000-8000-000000000001';
const ANNA = '0190a000-0000-7000-8000-000000000002';

const child = (id: string, firstName: string, lastName: string) => ({
  student: {
    id,
    user: { id: `${id}-u`, firstName, lastName, nickname: null, avatarUrl: null },
    classLabel: null,
  },
  linkStatus: 'ACTIVE' as const,
  school: null,
});

const hooks = vi.hoisted(() => ({ children: null as unknown }));

const ready = (data: ChildrenList) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});

vi.mock('@/entities/student', async (importOriginal) => ({
  ...(await importOriginal<typeof StudentEntity>()),
  useChildren: () => hooks.children,
}));

// Виджеты и шторка проверяются отдельно; здесь — только композиция главной.
vi.mock('@/widgets/parent-home-header', () => ({
  ParentHomeHeader: ({ onOpenWallet }: { onOpenWallet: () => void }) => (
    <button type="button" onClick={onOpenWallet}>
      кошелёк
    </button>
  ),
}));
vi.mock('@/widgets/parent-home-schedule', () => ({
  ParentHomeSchedule: ({ studentId }: { studentId: string }) => <p>расписание {studentId}</p>,
}));
vi.mock('@/widgets/parent-home-homework', () => ({
  ParentHomeHomework: ({ studentId }: { studentId: string }) => <p>задания {studentId}</p>,
}));
vi.mock('@/features/link-child', () => ({
  AddChildSheet: ({ open }: { open: boolean }) => (open ? <p>шторка добавления</p> : null),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/parent']}>
      <Routes>
        <Route path="/parent" element={<ParentHomePage />} />
        <Route path="/parent/wallet" element={<p>пополнение</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('ParentHomePage', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedChildId: null });
  });

  it('без детей: только «+» и приглашение добавить, расписание и задания не монтируются', async () => {
    const user = userEvent.setup();
    hooks.children = ready({ items: [] });
    renderHome();

    expect(screen.getByRole('heading', { level: 1, name: 'Главная' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Дети' })).not.toBeInTheDocument();
    expect(screen.getByText('Добавь ребёнка')).toBeInTheDocument();
    expect(screen.queryByText(/^расписание/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^задания/)).not.toBeInTheDocument();

    // «+» в ленте сердец и кнопка в пустом состоянии открывают одну шторку.
    const [heartAdd] = screen.getAllByRole('button', { name: 'Добавить' });
    await user.click(heartAdd!);
    expect(screen.getByText('шторка добавления')).toBeInTheDocument();
  });

  it('дети — сердца: выбранный по центру, тап по другому меняет ребёнка главной', async () => {
    const user = userEvent.setup();
    hooks.children = ready({
      items: [child(EGOR, 'Егор', 'Иванов'), child(ANNA, 'Анна', 'Петрова')],
    });
    useUiStore.setState({ selectedChildId: EGOR });
    renderHome();

    const hearts = screen.getByRole('listbox', { name: 'Дети' });
    expect(within(hearts).getByRole('option', { name: 'Иванов Е.' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(`расписание ${EGOR}`)).toBeInTheDocument();
    expect(screen.getByText(`задания ${EGOR}`)).toBeInTheDocument();

    await user.click(within(hearts).getByRole('option', { name: 'Петрова А.' }));
    expect(useUiStore.getState().selectedChildId).toBe(ANNA);
    expect(await screen.findByText(`расписание ${ANNA}`)).toBeInTheDocument();
  });

  it('кошелёк в шапке открывает пополнение', async () => {
    const user = userEvent.setup();
    hooks.children = ready({ items: [child(EGOR, 'Егор', 'Иванов')] });
    useUiStore.setState({ selectedChildId: EGOR });
    renderHome();

    await user.click(screen.getByRole('button', { name: 'кошелёк' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/parent/wallet');
  });
});
