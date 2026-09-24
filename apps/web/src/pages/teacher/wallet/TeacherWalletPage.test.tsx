import { TeacherWalletSchema, type TeacherWallet, type TeacherWalletPeriod } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { ApiClientError } from '@/shared/api/errors';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { TeacherWalletPage } from './ui/TeacherWalletPage';

const id = (suffix: string) => `0190a000-0000-7000-8000-${suffix.padStart(12, '0')}`;

const teacher = {
  id: id('f1'),
  user: { id: id('f2'), firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
  photoUrl: null,
};
const club = { id: id('c1'), title: 'Робототехника', category: 'ROBOTICS', coverUrl: null };
const group = (suffix: string, code: string) => ({
  id: id(suffix),
  title: `Робототехника, группа ${code}`,
  code,
  club,
  teacher,
});
const student = (suffix: string, firstName: string, lastName: string) => ({
  id: id(suffix),
  user: { id: id(`e${suffix}`), firstName, lastName, nickname: null, avatarUrl: null },
  classLabel: null,
});
const rub = (rubles: number) => ({ amountKopecks: rubles * 100, currency: 'RUB' as const });

const g001 = group('a1', '001');
const g012 = group('a2', '012');
const g003 = group('a3', '003');
const petrov = student('b1', 'Иван', 'Петров');
const sidorova = student('b2', 'Анна', 'Сидорова');

/** Момент `daysAgo` дней назад в hh:mm по поясу браузера — дни в тесте календарные. */
function at(daysAgo: number, hours: number, minutes = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const income = (key: string, when: string, amount: number, g = g001, s = petrov) => ({
  id: id(key),
  kind: 'INCOME' as const,
  amount: rub(amount),
  at: when,
  group: g,
  student: s,
});

function walletOf(period: TeacherWalletPeriod, overrides: Partial<TeacherWallet> = {}) {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (period === 'day' ? 0 : period === 'week' ? 6 : 29));
  return TeacherWalletSchema.parse({
    balance: rub(6700),
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    history: [
      { at: from.toISOString(), balance: rub(2700) },
      { at: now.toISOString(), balance: rub(6700) },
    ],
    // Сервер отдаёт по убыванию — экран сам раскладывает по дням по возрастанию, как в макете.
    transactions: [
      income('d6', at(0, 17), 5000, g012, sidorova),
      income('d5', at(0, 10), 2500),
      {
        id: id('d4'),
        kind: 'WITHDRAWAL',
        amount: rub(12_388),
        at: at(1, 19),
        group: null,
        student: null,
      },
      income('d3', at(1, 17, 28), 3000, g003),
      income('d2', at(1, 17), 5000, g012, sidorova),
      income('d1', at(1, 10), 2500),
    ],
    debts: [
      { id: id('f5'), group: g001, student: petrov, amount: rub(2500), dueAt: '2020-10-24' },
      { id: id('f6'), group: g012, student: sidorova, amount: rub(5000), dueAt: '2099-11-01' },
    ],
    ...overrides,
  });
}

const ready = (data: TeacherWallet) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  isPlaceholderData: false,
  refetch: vi.fn(),
});

const hooks = vi.hoisted(() => ({
  periods: [] as string[],
  wallet: null as null | ((period: TeacherWalletPeriod) => unknown),
}));

vi.mock('@/entities/payment', () => ({
  useTeacherWallet: (period: TeacherWalletPeriod) => {
    hooks.periods.push(period);
    return hooks.wallet!(period);
  },
  useWithdrawTeacherWallet: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/shared/auth/hooks', () => ({
  useMe: () => ({
    user: {
      id: '0190a000-0000-7000-8000-0000000000f2',
      firstName: 'Мария',
      lastName: 'Иванова',
      nickname: null,
      avatarUrl: null,
    },
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderWallet(
  entries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = [
    '/teacher/settings',
    { pathname: '/teacher/wallet', state: { fromApp: true } },
  ],
) {
  const bridge = new MockMaxBridge({
    launchParams: null,
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  });
  return render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <MemoryRouter initialEntries={entries} initialIndex={(entries?.length ?? 1) - 1}>
          <Routes>
            <Route path="/teacher" element={<p>главная</p>} />
            <Route path="/teacher/settings" element={<p>настройки</p>} />
            <Route path="/teacher/wallet" element={<TeacherWalletPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </MaxBridgeProvider>,
  );
}

/** Ячейки CardColumns идут по колонкам: колонка `index` из `columns` при `rows` строках. */
function column(table: HTMLElement, index: number, rows: number): string[] {
  return within(table)
    .getAllByRole('cell')
    .slice(index * rows, (index + 1) * rows)
    .map((cell) => cell.textContent ?? '');
}

describe('TeacherWalletPage', () => {
  beforeEach(() => {
    hooks.periods = [];
    hooks.wallet = (period) => ready(walletOf(period));
  });

  it('баланс, график, транзакции по дням со строкой вывода и «Вам должны»', async () => {
    const user = userEvent.setup();
    renderWallet();

    expect(screen.getByRole('heading', { level: 1, name: 'Кошелёк: Иванова М.' })).toBeVisible();
    expect(screen.getByRole('img', { name: /^Баланс 6\s700\s₽$/ })).toHaveTextContent('6700');
    const chart = screen.getByRole('img', {
      name: /^Изменение баланса за 1 день: с 2\s700\s₽ до 6\s700\s₽$/,
    });
    expect(chart).toBeInTheDocument();
    expect(screen.getByText('Изменение баланса')).toBeInTheDocument();
    // Окно — последние 24 часа: подписи на «круглых» часах, крайние могут совпадать.
    for (const label of ['4:00', '8:00', '12:00', '16:00', '20:00', '00:00']) {
      expect(within(chart).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(chart).getByText(/^10\s000$/)).toBeInTheDocument();
    expect(within(chart).getByText('5000')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 день' })).toHaveAttribute('aria-checked', 'true');
    expect(hooks.periods.at(-1)).toBe('day');

    // Транзакции: «вчера» над «сегодня», внутри дня — по времени; заголовки колонок есть у обоих.
    expect(screen.getByRole('heading', { level: 2, name: 'Транзакции' })).toBeInTheDocument();
    const tables = screen.getAllByRole('table', { name: /^Транзакции: / });
    expect(tables.map((table) => table.getAttribute('aria-label'))).toEqual([
      'Транзакции: вчера',
      'Транзакции: сегодня',
    ]);
    const [yesterday, today] = tables as [HTMLElement, HTMLElement];
    expect(
      within(yesterday)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Группа', 'ФИО ученика', 'Сумма', 'Время']);
    expect(within(today).getAllByRole('columnheader')).toHaveLength(4);

    expect(column(yesterday, 0, 4)).toEqual(['001', '012', '003', '—']);
    expect(column(yesterday, 1, 4)).toEqual(['Петров И.', 'Сидорова А.', 'Петров И.', 'Вывод']);
    expect(column(yesterday, 2, 4)).toEqual([
      '2500',
      '5000',
      '3000',
      expect.stringMatching(/^12\s388$/),
    ]);
    expect(column(yesterday, 3, 4)).toEqual(['10:00', '17:00', '17:28', '19:00']);
    expect(column(today, 3, 2)).toEqual(['10:00', '17:00']);
    // Строка вывода подложена красным.
    expect(within(yesterday).getByRole('cell', { name: 'Вывод' })).toHaveAttribute(
      'data-tone',
      'danger',
    );

    // «Вам должны»: таблица с заголовками, даты dd.MM.yy, просроченная — со словом для скринридера.
    const debts = screen.getByRole('table', { name: 'Вам должны' });
    expect(
      within(debts)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Группа', 'ФИО ученика', 'Сумма', 'Дата']);
    expect(column(debts, 2, 2)).toEqual(['2500', '5000']);
    expect(column(debts, 3, 2)).toEqual(['24.10.20, просрочено', '01.11.99']);

    // «Вывести» открывает шторку вывода.
    await user.click(screen.getByRole('button', { name: 'Вывести' }));
    const sheet = screen.getByRole('dialog', { name: 'Вывод средств' });
    expect(within(sheet).getByText(/Доступно для вывода: 6\s700\s₽/)).toBeInTheDocument();
  });

  it('переключение периода запрашивает новое окно и перестраивает ось X', async () => {
    const user = userEvent.setup();
    renderWallet();
    expect(screen.getByRole('img', { name: /за 1 день/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '7 дней' }));
    expect(hooks.periods.at(-1)).toBe('week');
    expect(screen.getByRole('radio', { name: '7 дней' })).toHaveAttribute('aria-checked', 'true');
    const chart = screen.getByRole('img', { name: /^Изменение баланса за 7 дней: / });
    expect(within(chart).queryByText('4:00')).not.toBeInTheDocument();
    const weekday = new Intl.DateTimeFormat('ru', { weekday: 'short' }).format(new Date());
    expect(within(chart).getAllByText(weekday).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: '30 дней' }));
    expect(hooks.periods.at(-1)).toBe('month');
    expect(
      screen.getByRole('img', { name: /^Изменение баланса за 30 дней: / }),
    ).toBeInTheDocument();
  });

  it('пустые транзакции и долги, нулевой баланс — вывод недоступен', () => {
    hooks.wallet = (period) =>
      ready(
        walletOf(period, {
          balance: rub(0),
          history: [],
          transactions: [],
          debts: [],
        }),
      );
    renderWallet();

    expect(screen.getByText('За этот период транзакций нет')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /^Транзакции/ })).not.toBeInTheDocument();
    expect(screen.getByText('Никто не должен')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Вам должны' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вывести' })).toBeDisabled();
    expect(
      screen.getByRole('img', { name: /^Изменение баланса за 1 день: с 0\s₽ до 0\s₽$/ }),
    ).toBeInTheDocument();
  });

  it('загрузка — скелеты и недоступный вывод; ошибка — «Не удалось загрузить» с повтором', async () => {
    const user = userEvent.setup();
    hooks.wallet = () => ({
      data: undefined,
      error: null,
      isPending: true,
      isError: false,
      isSuccess: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });
    const { unmount } = renderWallet();
    expect(screen.getByRole('img', { name: 'Баланс загружается' })).toHaveTextContent('…');
    expect(screen.getByRole('button', { name: 'Вывести' })).toBeDisabled();
    expect(screen.queryByRole('img', { name: /Изменение баланса/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Транзакции' })).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    hooks.wallet = () => ({
      data: undefined,
      error: new ApiClientError({ status: 500, code: 'INTERNAL', message: 'boom' }),
      isPending: false,
      isError: true,
      isSuccess: false,
      isPlaceholderData: false,
      refetch,
    });
    renderWallet();
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    expect(screen.queryByRole('heading', { level: 2, name: 'Транзакции' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вывести' })).toBeDisabled();
    // Период можно сменить и при ошибке.
    expect(screen.getByRole('radiogroup', { name: 'Период' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('«Баланс ✕»: из приложения — назад по истории', async () => {
    const user = userEvent.setup();
    renderWallet();
    await user.click(screen.getByRole('button', { name: 'Закрыть баланс' }));
    expect(await screen.findByText('настройки')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/teacher\/settings$/);
  });

  it('«Баланс ✕»: по прямой ссылке — на главную', async () => {
    const user = userEvent.setup();
    renderWallet(['/teacher/wallet']);
    await user.click(screen.getByRole('button', { name: 'Закрыть баланс' }));
    expect(await screen.findByText('главная')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/teacher$/);
  });
});
