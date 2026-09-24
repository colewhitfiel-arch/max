import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WalletHero } from './WalletHero';

describe('WalletHero', () => {
  it('сумма с доступным названием, «Вывести» — настоящая кнопка: клик и Enter', async () => {
    const onAction = vi.fn();
    render(
      <WalletHero
        amount="6700"
        aria-label="Баланс 6 700 ₽"
        actionLabel="Вывести"
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('img', { name: 'Баланс 6 700 ₽' })).toHaveTextContent('6700');
    const button = screen.getByRole('button', { name: 'Вывести' });
    expect(button).toHaveAttribute('type', 'button');

    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('actionDisabled блокирует кнопку; без aria-label сумма читается текстом', async () => {
    const onAction = vi.fn();
    render(<WalletHero amount="0" actionLabel="Вывести" onAction={onAction} actionDisabled />);
    const button = screen.getByRole('button', { name: 'Вывести' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('иконки декоративные, длинная сумма ужимается', () => {
    const { container, rerender } = render(
      <WalletHero amount="6700" actionLabel="Вывести" onAction={() => undefined} />,
    );
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
    const amount = container.querySelector('.ui-wallet-hero__amount')!;
    expect(amount).toHaveAttribute('data-size', 'md');
    rerender(<WalletHero amount="123456" actionLabel="Вывести" onAction={() => undefined} />);
    expect(amount).toHaveAttribute('data-size', 'sm');
  });
});
