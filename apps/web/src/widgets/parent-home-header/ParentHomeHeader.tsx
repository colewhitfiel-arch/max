import { Avatar, Inline, Text, WalletChip } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useWallet } from '@/entities/payment';
import { shortName } from '@/entities/student';
import { useMe } from '@/shared/auth/hooks';
import { fullName } from '@/shared/lib/format';
import { formatMoney, wholeRubles } from '@/shared/lib/money';

export interface ParentHomeHeaderProps {
  /** Нажатие на кошелёк — экран пополнения. */
  onOpenWallet: () => void;
}

/**
 * Шапка главной родителя (макет): слева аватар и краткое имя («Фамилия И.»), справа —
 * кошелёк с балансом (`GET /parent/wallet`), который открывает пополнение. Пока баланс
 * грузится или не загрузился — вместо суммы многоточие, кнопка всё равно работает.
 */
export function ParentHomeHeader({ onOpenWallet }: ParentHomeHeaderProps) {
  const { t, i18n } = useTranslation('parent-home');
  const me = useMe();
  const wallet = useWallet();
  const user = me?.user;
  const balance = wallet.data?.balance;

  return (
    <Inline justify="between" align="center" wrap={false} gap={3}>
      <Inline gap={2} align="center" wrap={false}>
        {user && <Avatar name={fullName(user)} src={user.avatarUrl} />}
        <Text as="span" truncate>
          {user ? shortName(user) : ''}
        </Text>
      </Inline>
      <WalletChip
        amount={balance ? wholeRubles(balance.amountKopecks, i18n.language) : '…'}
        aria-label={
          balance
            ? t('header.wallet', { amount: formatMoney(balance, i18n.language) })
            : t('header.walletUnknown')
        }
        onClick={onOpenWallet}
      />
    </Inline>
  );
}
