/**
 * Шапка главной родителя: баланс в чипе кошелька; загрузка — многоточие, ошибка — прочерк и
 * отдельная подпись (не путается с загрузкой). Чип открывает пополнение в любом состоянии.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { ParentHomeHeader } from './ParentHomeHeader';

const hooks = vi.hoisted(() => ({ wallet: null as unknown }));

vi.mock('@/entities/payment', () => ({ useWallet: () => hooks.wallet }));
vi.mock('@/shared/auth/hooks', () => ({
  useMe: () => ({
    user: { id: 'u1', firstName: 'Анна', lastName: 'Петрова', nickname: null, avatarUrl: null },
  }),
}));

const base = { data: undefined, error: null, isPending: false, isError: false, refetch: vi.fn() };

describe('ParentHomeHeader', () => {
  beforeEach(() => {
    hooks.wallet = { ...base, isPending: true };
  });

  it('баланс загружен: сумма и подпись с балансом', () => {
    hooks.wallet = {
      ...base,
      data: { balance: { amountKopecks: 150_000, currency: 'RUB' } },
    };
    render(<ParentHomeHeader onOpenWallet={() => {}} />);
    const chip = screen.getByRole('button', { name: /^Баланс .+, пополнить$/ });
    expect(chip.textContent).toMatch(/1\s?500/);
  });

  it('баланс грузится: многоточие', () => {
    render(<ParentHomeHeader onOpenWallet={() => {}} />);
    expect(screen.getByRole('button', { name: 'Пополнить баланс' })).toHaveTextContent('…');
  });

  it('баланс не загрузился: прочерк и подпись об ошибке, чип открывает пополнение', async () => {
    const user = userEvent.setup();
    const onOpenWallet = vi.fn();
    hooks.wallet = { ...base, isError: true, error: new Error('x') };
    render(<ParentHomeHeader onOpenWallet={onOpenWallet} />);

    const chip = screen.getByRole('button', { name: 'Баланс не загрузился, пополнить' });
    expect(chip).toHaveTextContent('—');
    expect(chip).not.toHaveTextContent('…');
    await user.click(chip);
    expect(onOpenWallet).toHaveBeenCalledTimes(1);
  });
});
