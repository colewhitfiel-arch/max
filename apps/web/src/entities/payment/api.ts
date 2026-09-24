import {
  TEACHER_WALLET_DEFAULT_PERIOD,
  type CreatePaymentBody,
  type TeacherWallet,
  type TeacherWalletPeriod,
  type TeacherWithdrawal,
  type TopUpWalletBody,
  type WithdrawTeacherWalletBody,
} from '@edu/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, call } from '@/shared/api/client';
import { paymentKeys } from './keys';
import { withWithdrawal } from './model';

/** `GET /parent/children/:studentId/payments`. */
export function useChildPayments(studentId: string | null) {
  return useQuery({
    queryKey: paymentKeys.childPayments(studentId ?? ''),
    queryFn: () => call(api.payments.getChildPayments({ params: { studentId: studentId! } })),
    enabled: !!studentId,
  });
}

/**
 * `POST /parent/children/:studentId/payments` с Idempotency-Key → confirmationUrl.
 * Ключ идемпотентности даёт экран: один на попытку, чтобы повтор после сбоя сети не создал
 * второй платёж.
 */
export function useCreatePayment(studentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }: CreatePaymentBody & { idempotencyKey: string }) =>
      call(
        api.payments.createPayment({
          params: { studentId: studentId! },
          body,
          headers: { 'idempotency-key': idempotencyKey },
        }),
      ),
    onSuccess: () => {
      if (studentId)
        void queryClient.invalidateQueries({ queryKey: paymentKeys.childPayments(studentId) });
    },
  });
}

/** Интервал опроса статуса платежа и его предел (docs/07 F10: не дольше 60 с). */
const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_LIMIT_MS = 60_000;

/**
 * `GET /parent/payments/:paymentId` — опрос статуса после возврата с оплаты: пока платёж
 * `PENDING`, но не дольше `PAYMENT_POLL_LIMIT_MS` (по числу ответов, без сверки часов с сервером).
 */
export function usePayment(paymentId: string | null, poll = false) {
  return useQuery({
    queryKey: paymentKeys.payment(paymentId ?? ''),
    queryFn: () => call(api.payments.getPayment({ params: { paymentId: paymentId! } })),
    enabled: !!paymentId,
    refetchInterval: (query) => {
      if (!poll) return false;
      const { data, dataUpdateCount } = query.state;
      if (data && data.status !== 'PENDING') return false;
      if (dataUpdateCount * PAYMENT_POLL_INTERVAL_MS >= PAYMENT_POLL_LIMIT_MS) return false;
      return PAYMENT_POLL_INTERVAL_MS;
    },
  });
}

/**
 * Итог платежа после перехода на оплату (docs/07 F10 п.4): опрос `usePayment`, а как только
 * статус стал терминальным — перезапрос платежей ребёнка (история, «оплачено до»).
 * Экран показывает итог по `data.status`.
 */
export function usePaymentResult(paymentId: string | null) {
  const queryClient = useQueryClient();
  const query = usePayment(paymentId, true);
  const payment = query.data;
  useEffect(() => {
    if (!payment || payment.status === 'PENDING') return;
    void queryClient.invalidateQueries({ queryKey: paymentKeys.childPayments(payment.student.id) });
  }, [payment, queryClient]);
  return query;
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

/**
 * `GET /teacher/wallet?period=` — кошелёк преподавателя (заглушка до PaymentProvider): баланс,
 * точки графика, транзакции за период и «Вам должны». При смене периода остаются прежние данные
 * (`placeholderData`), чтобы экран не мигал скелетом, пока грузится новое окно.
 */
export function useTeacherWallet(period: TeacherWalletPeriod = TEACHER_WALLET_DEFAULT_PERIOD) {
  return useQuery({
    queryKey: paymentKeys.teacherWallet(period),
    queryFn: () => call(api.payments.getTeacherWallet({ query: { period } })),
    placeholderData: keepPreviousData,
  });
}

/** Реакция экрана на итог вывода: срабатывает, даже если форма уже размонтирована. */
export interface WithdrawTeacherWalletCallbacks {
  onSuccess?: (result: TeacherWithdrawal) => void;
  onError?: (error: unknown) => void;
}

/**
 * `POST /teacher/wallet/withdraw` с Idempotency-Key. Заглушка: сервер (мок) списывает сразу.
 * Новый баланс и сам вывод сразу кладём во все закэшированные периоды (чип на главной, крупная
 * сумма и график меняются без ожидания), а после любого исхода перезапрашиваем их: при ошибке
 * с неизвестным результатом (таймаут) на экране будет фактический баланс, а не прежний.
 * Ключ идемпотентности даёт экран: один на попытку, чтобы повтор после сбоя сети не списал дважды.
 * `callbacks` — уровня мутации (не `mutate`): тост и отклик не теряются, если экран закрыли.
 */
export function useWithdrawTeacherWallet(callbacks: WithdrawTeacherWalletCallbacks = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      amountKopecks,
      idempotencyKey,
    }: WithdrawTeacherWalletBody & { idempotencyKey: string }) =>
      call(
        api.payments.withdrawTeacherWallet({
          body: { amountKopecks },
          headers: { 'idempotency-key': idempotencyKey },
        }),
      ),
    onSuccess: (result) => {
      queryClient.setQueriesData<TeacherWallet>(
        { queryKey: paymentKeys.teacherWalletRoot() },
        (wallet) => (wallet ? withWithdrawal(wallet, result) : wallet),
      );
      callbacks.onSuccess?.(result);
    },
    onError: (error) => callbacks.onError?.(error),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: paymentKeys.teacherWalletRoot() });
    },
  });
}
