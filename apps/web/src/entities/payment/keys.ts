import { queryKeys } from '@/shared/api/query-keys';

export const paymentKeys = {
  childPayments: (studentId: string) => [...queryKeys.parent(studentId), 'payments'] as const,
  payment: (paymentId: string) => [...queryKeys.parentRoot, 'payments', paymentId] as const,
  /** Кошелёк родителя — общий на всех детей. */
  wallet: () => [...queryKeys.parentRoot, 'wallet'] as const,
};
