import type { TeacherWalletPeriod } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const paymentKeys = {
  childPayments: (studentId: string) => [...queryKeys.parent(studentId), 'payments'] as const,
  payment: (paymentId: string) => [...queryKeys.parentRoot, 'payments', paymentId] as const,
  /** Кошелёк родителя — общий на всех детей. */
  wallet: () => [...queryKeys.parentRoot, 'wallet'] as const,
  /** Все периоды кошелька преподавателя — префикс для инвалидации после вывода. */
  teacherWalletRoot: () => [...queryKeys.teacher, 'wallet'] as const,
  /** Кошелёк преподавателя за период (график и транзакции зависят от окна). */
  teacherWallet: (period: TeacherWalletPeriod) => [...queryKeys.teacher, 'wallet', period] as const,
};
