/** Платежи родителя: периоды к оплате, история, создание платежа (fake-провайдер). */
import {
  ChildPaymentsSchema,
  CreatePaymentBodySchema,
  CreatePaymentResultSchema,
  PaymentDtoSchema,
} from '@edu/contracts';
import { http } from 'msw';
import { addDays, toDateOnly } from '../../../lib/dates';
import { childrenIdsOfParent, clubBrief, enrollmentsOfStudent, studentBrief } from '../demo';
import { apiError, apiUrl, authed, json, readBody } from '../lib';
import { db, parentOfUser } from '../state';

/** Оплачено до / следующий платёж по зачислению. */
export function paidUntilOf(enrollmentId: string): {
  paidUntil: string | null;
  nextPaymentAt: string;
} {
  const periods = db.paidPeriods
    .filter((p) => p.enrollmentId === enrollmentId)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const last = periods[0];
  if (!last) return { paidUntil: null, nextPaymentAt: toDateOnly(new Date()) };
  return { paidUntil: last.periodEnd, nextPaymentAt: toDateOnly(addDays(last.periodEnd, 1)) };
}

function paymentDto(paymentId: string) {
  const payment = db.payments.find((p) => p.id === paymentId)!;
  const enrollment = db.enrollments.find((e) => e.id === payment.enrollmentId)!;
  const group = db.groups.find((g) => g.id === enrollment.groupId)!;
  return { ...payment, club: clubBrief(group.clubId), student: studentBrief(payment.studentId) };
}

export const paymentsHandlers = [
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
          const start = paidUntil ? addDays(paidUntil, 1) : new Date();
          db.paidPeriods.push({
            id: crypto.randomUUID(),
            enrollmentId: enrollment.id,
            periodStart: toDateOnly(start),
            periodEnd: toDateOnly(addDays(start, 30 * body.data.periodsCount - 1)),
            paymentId: id,
          });
        }, 5000);
        return json(CreatePaymentResultSchema, { paymentId: id, confirmationUrl, amount });
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
