import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WalletChip } from './WalletChip';

describe('WalletChip', () => {
  it('кнопка с доступным названием и суммой, клик и Enter вызывают onClick', async () => {
    const onClick = vi.fn();
    render(<WalletChip amount="6700" onClick={onClick} aria-label="Баланс 6700 ₽, пополнить" />);
    const button = screen.getByRole('button', { name: 'Баланс 6700 ₽, пополнить' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveTextContent('6700');

    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('по умолчанию рисует плюс, plus={false} — только кошелёк и сумма', () => {
    const { container, rerender } = render(
      <WalletChip amount="6700" onClick={() => undefined} aria-label="Баланс 6700 ₽" />,
    );
    expect(container.querySelector('.ui-wallet-chip__plus')).not.toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(2);

    rerender(
      <WalletChip
        amount="6700"
        plus={false}
        onClick={() => undefined}
        aria-label="Баланс 6700 ₽, открыть кошелёк"
      />,
    );
    expect(container.querySelector('.ui-wallet-chip__plus')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Баланс 6700 ₽, открыть кошелёк' }),
    ).toHaveTextContent('6700');
  });

  it('иконки декоративные', () => {
    const { container } = render(
      <WalletChip amount="0" onClick={() => undefined} aria-label="Баланс 0 ₽" />,
    );
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
