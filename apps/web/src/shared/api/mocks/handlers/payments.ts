/**
 * Платежи родителя: периоды к оплате, история, создание платежа (fake-провайдер); кошелёк —
 * заглушка (docs/07 F13): пополнение зачисляется сразу, идемпотентно по Idempotency-Key.
 * Кошелёк преподавателя — тоже заглушка (`../teacher-wallet.ts`): вывод списывается сразу,
 * идемпотентно по Idempotency-Key.
 */
import {
  ChildPaymentsSchema,
  CreatePaymentBodySchema,
  CreatePaymentResultSchema,
  PaymentDtoSchema,
  TeacherWalletQuerySchema,
  TeacherWalletSchema,
  TeacherWithdrawalSchema,
  TopUpWalletBodySchema,
  WalletSchema,
  WithdrawTeacherWalletBodySchema,
} from '@edu/contracts';
import { http } from 'msw';
import { addDays, toDateOnly } from '../../../lib/dates';
import { childrenIdsOfParent, clubBrief, enrollmentsOfStudent, studentBrief } from '../demo';
import { apiError, apiUrl, authed, json, query, readBody } from '../lib';
import { db, parentOfUser, teacherOfUser } from '../state';
import {
  fromDateOnly,
  nextPaymentDate,
  rub,
  teacherWalletDto,
  teacherWalletOf,
  transactionDto,
  walletBalance,
} from '../teacher-wallet';
import type { MockTeacherTransaction } from '../world-extras';

/**
 * Оплачено до / следующий платёж по зачислению. Дата следующего платежа — та же, что у
 * преподавателя в «Вам должны» (`nextPaymentDate`): день после последнего периода, без оплат —
 * день зачисления.
 */
export function paidUntilOf(enrollmentId: string): {
  paidUntil: string | null;
  nextPaymentAt: string;
} {
  const enrollment = db.enrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) throw new Error(`mock: нет зачисления ${enrollmentId}`);
  const last = db.paidPeriods
    .filter((p) => p.enrollmentId === enrollmentId)
    .map((p) => p.periodEnd)
    .sort()
    .at(-1);
  return { paidUntil: last ?? null, nextPaymentAt: toDateOnly(nextPaymentDate(enrollment)) };
}

function paymentDto(paymentId: string) {
  const payment = db.payments.find((p) => p.id === paymentId)!;
  const enrollment = db.enrollments.find((e) => e.id === payment.enrollmentId)!;
  const group = db.groups.find((g) => g.id === enrollment.groupId)!;
  return { ...payment, club: clubBrief(group.clubId), student: studentBrief(payment.studentId) };
}

export const paymentsHandlers = [
  http.get(
    apiUrl('/parent/wallet'),
    authed(
      ({ auth }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent) return apiError('FORBIDDEN', 'Нет профиля родителя');
        return json(WalletSchema, { balance: rub(db.wallets.get(parent.id) ?? 0) });
      },
      ['PARENT'],
    ),
  ),

  http.post(
    apiUrl('/parent/wallet/top-up'),
    authed(
      async ({ auth, request }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent) return apiError('FORBIDDEN', 'Нет профиля родителя');
        const body = await readBody(request, TopUpWalletBodySchema);
        if (!body.ok) return body.response;
        const key = request.headers.get('idempotency-key');
        // Контракт требует Idempotency-Key: без него — 400, как у ts-rest на сервере.
        if (!key) return apiError('VALIDATION', 'Нужен заголовок Idempotency-Key');
        const replayKey = `${parent.id}:${key}`;
        const previous = db.walletTopUps.get(replayKey);
        if (previous) {
          if (previous.amountKopecks !== body.data.amountKopecks) {
            return apiError('CONFLICT', 'Ключ идемпотентности уже использован с другой суммой');
          }
          return json(WalletSchema, { balance: rub(previous.balanceAfter) });
        }
        // Заглушка провайдера: деньги «приходят» сразу.
        const balanceAfter = (db.wallets.get(parent.id) ?? 0) + body.data.amountKopecks;
        db.wallets.set(parent.id, balanceAfter);
        db.walletTopUps.set(replayKey, { amountKopecks: body.data.amountKopecks, balanceAfter });
        return json(WalletSchema, { balance: rub(balanceAfter) });
      },
      ['PARENT'],
    ),
  ),

  http.get(
    apiUrl('/teacher/wallet'),
    authed(
      ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const q = TeacherWalletQuerySchema.safeParse(Object.fromEntries(query(request)));
        if (!q.success) {
          return apiError('VALIDATION', 'Неверные параметры запроса', q.error.flatten());
        }
        return json(TeacherWalletSchema, teacherWalletDto(teacher.id, q.data.period));
      },
      ['TEACHER'],
    ),
  ),

  http.post(
    apiUrl('/teacher/wallet/withdraw'),
    authed(
      async ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const body = await readBody(request, WithdrawTeacherWalletBodySchema);
        if (!body.ok) return body.response;
        const { amountKopecks } = body.data;
        const key = request.headers.get('idempotency-key');
        // Контракт требует Idempotency-Key: без него — 400, как у ts-rest на сервере.
        if (!key) return apiError('VALIDATION', 'Нужен заголовок Idempotency-Key');
        const replayKey = `${teacher.id}:${key}`;
        const previous = db.teacherWithdrawals.get(replayKey);
        if (previous) {
          if (previous.amountKopecks !== amountKopecks) {
            return apiError('CONFLICT', 'Ключ идемпотентности уже использован с другой суммой');
          }
          return json(TeacherWithdrawalSchema, previous.result);
        }
        const wallet = teacherWalletOf(teacher.id);
        const now = new Date();
        const balance = walletBalance(wallet, now);
        if (amountKopecks > balance) return apiError('BUSINESS_RULE', 'Недостаточно средств');
        // Заглушка провайдера: деньги «уходят» сразу, реального перевода нет.
        const transaction: MockTeacherTransaction = {
          id: crypto.randomUUID(),
          kind: 'WITHDRAWAL',
          amountKopecks,
          at: now.toISOString(),
          groupId: null,
          studentId: null,
        };
        wallet.transactions.push(transaction);
        const result = {
          balance: rub(balance - amountKopecks),
          transaction: transactionDto(transaction),
        };
        db.teacherWithdrawals.set(replayKey, { amountKopecks, result });
        return json(TeacherWithdrawalSchema, result);
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/payments'),
    authed(
      ({ auth, params }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent || !childrenIdsOfParent(parent.id).includes(params.studentId)) {
          return apiError('FORBIDDEN', 'Ребёнок не привязан');
        }
        const periods = enrollmentsOfStudent(params.studentId).map((enrollment) => {
          const group = db.groups.find((g) => g.id === enrollment.groupId)!;
          const club = db.clubs.find((c) => c.id === group.clubId)!;
          return {
            enrollmentId: enrollment.id,
            club: clubBrief(club.id),
            ...paidUntilOf(enrollment.id),
            price: club.price,
          };
        });
        const history = db.payments
          .filter((p) => p.studentId === params.studentId && p.parentId === parent.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((p) => paymentDto(p.id));
        return json(ChildPaymentsSchema, { periods, history: { items: history } });
      },
      ['PARENT'],
    ),
  ),

  http.post<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/payments'),
    authed(
      async ({ auth, params, request }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent || !childrenIdsOfParent(parent.id).includes(params.studentId)) {
          return apiError('FORBIDDEN', 'Ребёнок не привязан');
        }
        const body = await readBody(request, CreatePaymentBodySchema);
        if (!body.ok) return body.response;
        const key = request.headers.get('idempotency-key');
        // Контракт требует Idempotency-Key: без него — 400, как у ts-rest на сервере.
        if (!key) return apiError('VALIDATION', 'Нужен заголовок Idempotency-Key');
        const replayKey = `${parent.id}:${key}`;
        const previous = db.parentPayments.get(replayKey);
        if (previous) {
          if (
            previous.enrollmentId !== body.data.enrollmentId ||
            previous.periodsCount !== body.data.periodsCount
          ) {
            return apiError('CONFLICT', 'Ключ идемпотентности уже использован с другим платежом');
          }
          return json(CreatePaymentResultSchema, previous.result);
        }
        const enrollment = db.enrollments.find(
          (e) => e.id === body.data.enrollmentId && e.studentId === params.studentId,
        );
        if (!enrollment) return apiError('NOT_FOUND', 'Зачисление не найдено');
        const group = db.groups.find((g) => g.id === enrollment.groupId)!;
        const club = db.clubs.find((c) => c.id === group.clubId)!;
        const id = crypto.randomUUID();
        const amount = {
          amountKopecks: club.price.amountKopecks * body.data.periodsCount,
          currency: 'RUB' as const,
        };
        const confirmationUrl = `https://pay.example.com/mock/${id}`;
        db.payments.push({
          id,
          parentId: parent.id,
          studentId: params.studentId,
          enrollmentId: enrollment.id,
          amount,
          status: 'PENDING',
          provider: 'fake',
          periodsCount: body.data.periodsCount,
          confirmationUrl,
          createdAt: new Date().toISOString(),
          paidAt: null,
          failReason: null,
        });
        // Fake-провайдер «подтверждает» оплату через 5 секунд.
        setTimeout(() => {
          const payment = db.payments.find((p) => p.id === id);
          if (!payment || payment.status !== 'PENDING') return;
          payment.status = 'SUCCEEDED';
          payment.paidAt = new Date().toISOString();
          const { paidUntil } = paidUntilOf(enrollment.id);
          // YYYY-MM-DD — как локальная дата, иначе в западных поясах период начнётся в день старого.
          const start = paidUntil ? addDays(fromDateOnly(paidUntil), 1) : new Date();
          db.paidPeriods.push({
            id: crypto.randomUUID(),
            enrollmentId: enrollment.id,
            periodStart: toDateOnly(start),
            periodEnd: toDateOnly(addDays(start, 30 * body.data.periodsCount - 1)),
            paymentId: id,
          });
        }, 5000);
        const result = { paymentId: id, confirmationUrl, amount };
        db.parentPayments.set(replayKey, {
          enrollmentId: enrollment.id,
          periodsCount: body.data.periodsCount,
          result,
        });
        return json(CreatePaymentResultSchema, result);
      },
      ['PARENT'],
    ),
  ),

  http.get<{ paymentId: string }>(
    apiUrl('/parent/payments/:paymentId'),
    authed(
      ({ auth, params }) => {
        const parent = parentOfUser(auth.user.id);
        const payment = db.payments.find((p) => p.id === params.paymentId);
        if (!payment || !parent || payment.parentId !== parent.id)
          return apiError('NOT_FOUND', 'Платёж не найден');
        return json(PaymentDtoSchema, paymentDto(payment.id));
      },
      ['PARENT'],
    ),
  ),
];
