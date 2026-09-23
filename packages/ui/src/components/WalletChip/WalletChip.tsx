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
  /** Открыть пополнение (или кошелёк — у репетитора). */
  onClick: () => void;
  /** Доступное название целиком («Баланс 6700 ₽, пополнить»). */
  'aria-label': string;
  /**
   * Маленький плюс после суммы — смысл «пополнить» (родитель). По умолчанию `true`;
   * `false` — только кошелёк и сумма (шапка репетитора: чип открывает кошелёк).
   */
  plus?: boolean;
}

/**
 * Кошелёк в шапке (макеты родителя и репетитора): «пилюля» #242424 с радиусом 10, кошелёк 24px
 * цвета акцента, сумма 16px и маленький плюс (`plus`) — кнопка «пополнить баланс» / «открыть
 * кошелёк». Зона нажатия шире видимой.
 */
export const WalletChip = forwardRef<HTMLButtonElement, WalletChipProps>(function WalletChip(
  { amount, onClick, plus = true, className, type = 'button', ...rest },
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
      {plus && (
        /* Плюс 10×10 из макета: скруглённые перекладины. */
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
      )}
    </button>
  );
});
