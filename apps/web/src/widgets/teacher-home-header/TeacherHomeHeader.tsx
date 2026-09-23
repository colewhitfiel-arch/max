import { Avatar, Inline, Text, WalletChip } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useTeacherWallet } from '@/entities/payment';
import { shortName } from '@/entities/student';
import { useMe } from '@/shared/auth/hooks';
import { fullName } from '@/shared/lib/format';
import { formatMoney, wholeRubles } from '@/shared/lib/money';

export interface TeacherHomeHeaderProps {
  /** Нажатие на кошелёк — экран кошелька (баланс, транзакции, вывод). */
  onOpenWallet: () => void;
}

/**
 * Шапка главной репетитора (макет): слева аватар и краткое имя («Фамилия И.»), справа —
 * кошелёк с балансом без плюса (`GET /teacher/wallet`): чип открывает кошелёк. Период — по
 * умолчанию, как у экрана кошелька, чтобы переход не перезапрашивал данные. Пока баланс
 * грузится или не загрузился — вместо суммы многоточие, кнопка всё равно работает.
 */
export function TeacherHomeHeader({ onOpenWallet }: TeacherHomeHeaderProps) {
  const { t, i18n } = useTranslation('teacher-home');
  const me = useMe();
  const wallet = useTeacherWallet();
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
        plus={false}
        amount={balance ? wholeRubles(balance, i18n.language) : '…'}
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
