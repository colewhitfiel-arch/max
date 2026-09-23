import type { CreatePaymentBody, TopUpWalletBody } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, newRequestId } from '@/shared/api/client';
import { paymentKeys } from './keys';

/** `GET /parent/children/:studentId/payments`. */
export function useChildPayments(studentId: string | null) {
  return useQuery({
    queryKey: paymentKeys.childPayments(studentId ?? ''),
    queryFn: () => call(api.payments.getChildPayments({ params: { studentId: studentId! } })),
    enabled: !!studentId,
  });
}

/** `POST /parent/children/:studentId/payments` с Idempotency-Key → confirmationUrl. */
export function useCreatePayment(studentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePaymentBody) =>
      call(
        api.payments.createPayment({
          params: { studentId: studentId! },
          body,
          headers: { 'idempotency-key': newRequestId() },
        }),
      ),
    onSuccess: () => {
      if (studentId)
        void queryClient.invalidateQueries({ queryKey: paymentKeys.childPayments(studentId) });
    },
  });
}

/** `GET /parent/payments/:paymentId` — опрос статуса после возврата с оплаты. */
export function usePayment(paymentId: string | null, poll = false) {
  return useQuery({
    queryKey: paymentKeys.payment(paymentId ?? ''),
    queryFn: () => call(api.payments.getPayment({ params: { paymentId: paymentId! } })),
    enabled: !!paymentId,
    refetchInterval: poll ? 3000 : false,
  });
}

/** `GET /parent/wallet` — баланс кошелька родителя (чип в шапке главной). */
export function useWallet() {
  return useQuery({
    queryKey: paymentKeys.wallet(),
    queryFn: () => call(api.payments.getWallet()),
  });
}

/**
 * `POST /parent/wallet/top-up` с Idempotency-Key. Заглушка (docs/07 F13): провайдера пока нет,
 * сервер (мок) зачисляет сразу и возвращает новый баланс — кладём его в кэш кошелька.
 * Ключ идемпотентности даёт экран: один на попытку, чтобы повтор после сбоя сети не зачёл дважды.
 */
export function useTopUpWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ amountKopecks, idempotencyKey }: TopUpWalletBody & { idempotencyKey: string }) =>
      call(
        api.payments.topUpWallet({
          body: { amountKopecks },
          headers: { 'idempotency-key': idempotencyKey },
        }),
      ),
    onSuccess: (wallet) => {
      queryClient.setQueryData(paymentKeys.wallet(), wallet);
    },
  });
}
