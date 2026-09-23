import type { TeacherWallet, TeacherWithdrawal } from '@edu/contracts';

/**
 * Кошелёк преподавателя сразу после вывода (до перезапроса): новый баланс и сам вывод в начале
 * списка операций (он по убыванию времени). Вывод позже конца окна (`to`), поэтому баланс в
 * моменты окна (текущий минус операции после момента) не сдвигается — меняется только текущий.
 * Повтор с тем же Idempotency-Key отдаёт ту же операцию — второй раз её не добавляем.
 */
export function withWithdrawal(wallet: TeacherWallet, result: TeacherWithdrawal): TeacherWallet {
  const { balance, transaction } = result;
  const known = wallet.transactions.some(({ id }) => id === transaction.id);
  return {
    ...wallet,
    balance,
    transactions: known ? wallet.transactions : [transaction, ...wallet.transactions],
  };
}
