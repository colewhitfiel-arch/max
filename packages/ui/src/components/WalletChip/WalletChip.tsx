import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { WalletIcon } from '../../icons';
import { cx } from '../../lib/cx';
import './WalletChip.css';

export interface WalletChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onClick' | 'aria-label'
> {
  /** Баланс, уже отформатированный («6700»). */
  amount: ReactNode;
  /** Открыть пополнение. */
  onClick: () => void;
  /** Доступное название целиком («Баланс 6700 ₽, пополнить»). */
  'aria-label': string;
}

/**
 * Кошелёк в шапке родителя (макет): «пилюля» #242424 с радиусом 10, зелёный кошелёк 24px,
 * сумма 16px и маленький плюс — кнопка «пополнить баланс». Зона нажатия шире видимой.
 */
export const WalletChip = forwardRef<HTMLButtonElement, WalletChipProps>(function WalletChip(
  { amount, onClick, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-wallet-chip', className)}
      onClick={() => onClick()}
      {...rest}
    >
      <WalletIcon className="ui-wallet-chip__icon" size={24} />
      <span className="ui-wallet-chip__amount">{amount}</span>
      {/* Плюс 10×10 из макета: скруглённые перекладины. */}
      <svg
        className="ui-wallet-chip__plus"
        width={10}
        height={10}
        viewBox="0 0 10 10"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M5 0.83v8.34M0.83 5h8.34"
          stroke="currentColor"
          strokeWidth={1.67}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </button>
  );
});
