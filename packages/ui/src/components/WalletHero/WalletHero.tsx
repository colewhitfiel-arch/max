import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react';
import { WalletIcon } from '../../icons';
import { cx } from '../../lib/cx';
import './WalletHero.css';

export interface WalletHeroProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> {
  /** Баланс, уже отформатированный («6700»): крупно внутри кошелька. */
  amount: ReactNode;
  /** Текст кнопки-«чаши» под кошельком («Вывести»). */
  actionLabel: ReactNode;
  onAction: () => void;
  /** Кнопка недоступна (нечего выводить / идёт запрос). */
  actionDisabled?: boolean;
  /**
   * Доступное название суммы целиком («Баланс 6 700 ₽»). Без него скринридер читает
   * саму сумму как текст.
   */
  'aria-label'?: string;
}

/* Контур «чаши» из макета (Vector 8, 97.85×46.89): вогнутый верх, круглое дно. */
const BOWL_PATH =
  'M48.929 46.8866C48.929 46.8866 95.7041 46.8867 97.8526 1.18574C97.899 0.199999 96.57 -0.281258 95.9029 0.445941C78.0488 19.9089 19.4347 18.6967 1.94074 0.335249C1.26576 -0.373199 -0.043518 0.117403 0.00111248 1.0949C2.09186 46.8866 48.929 46.8866 48.929 46.8866Z';

/** Ширина внутренней тени по нижнему краю чаши (макет: смещение −4px). */
const BOWL_SHADE = 4;

/** Длинная сумма ужимается, чтобы не наезжать на застёжку кошелька. */
function amountSize(amount: ReactNode): 'md' | 'sm' | 'xs' {
  if (typeof amount !== 'string' && typeof amount !== 'number') return 'md';
  const length = String(amount).length;
  return length >= 8 ? 'xs' : length >= 6 ? 'sm' : 'md';
}

/**
 * Баланс в кошельке репетитора (макет 59:16): крупный кошелёк 62px цвета primary с суммой
 * внутри и под ним зелёная «чаша» (цвет success, более тёмный нижний край) — кнопка вывода.
 */
export const WalletHero = forwardRef<HTMLDivElement, WalletHeroProps>(function WalletHero(
  {
    amount,
    actionLabel,
    onAction,
    actionDisabled = false,
    className,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const clipId = `ui-wallet-hero-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div ref={ref} className={cx('ui-wallet-hero', className)} {...rest}>
      <div
        className="ui-wallet-hero__wallet"
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
      >
        <WalletIcon className="ui-wallet-hero__icon" size={62} />
        <span className="ui-wallet-hero__amount" data-size={amountSize(amount)}>
          {amount}
        </span>
      </div>
      <button
        type="button"
        className="ui-wallet-hero__action"
        disabled={actionDisabled}
        onClick={() => onAction()}
      >
        <svg
          className="ui-wallet-hero__bowl"
          width={98}
          height={47}
          viewBox="0 0 97.8538 46.8866"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={BOWL_PATH} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {/* Тень: вся чаша темнее, поверх — светлая, поднятая на 4px (внутренняя тень снизу). */}
            <path className="ui-wallet-hero__bowl-shade" d={BOWL_PATH} />
            <path
              className="ui-wallet-hero__bowl-fill"
              d={BOWL_PATH}
              transform={`translate(0 ${-BOWL_SHADE})`}
            />
          </g>
        </svg>
        <span className="ui-wallet-hero__label">{actionLabel}</span>
      </button>
    </div>
  );
});
