import type { PaymentStatus } from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  Screen,
  Stack,
  type Tone,
  useToast,
} from '@edu/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useChildPayments, useCreatePayment, usePaymentResult } from '@/entities/payment';
import { NoChildState } from '@/features/link-child';
import { newRequestId } from '@/shared/api/client';
import { describeApiError } from '@/shared/api/errors';
import { formatDateOnly, formatDateTime } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import { isFromApp } from '@/shared/lib/navigation';
import { PARENT_HOME_PATH } from '@/shared/lib/parent-paths';
import { useMaxBridge } from '@/shared/max';
import { useSelectedChildId } from '@/shared/store/ui-store';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

const STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'warning',
};

/** `/parent/payments` — периоды к оплате и история; «Оплатить» → confirmationUrl через MaxBridge (F10). */
export function PaymentsPage() {
  const { t, i18n } = useTranslation('parent');
  const bridge = useMaxBridge();
  const toast = useToast();
  const location = useLocation();
  const studentId = useSelectedChildId();
  const query = useChildPayments(studentId);
  const create = useCreatePayment(studentId);
  /** Ключ идемпотентности на попытку оплаты периода: повтор после сбоя не создаст второй платёж. */
  const idempotencyKeys = useRef<Record<string, string>>({});
  /** Платёж, ушедший на страницу оплаты: опрашиваем до итога (F10 п.4). */
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const result = usePaymentResult(pendingPaymentId);

  const settled = result.data && result.data.status !== 'PENDING' ? result.data : null;
  useEffect(() => {
    if (!settled) return;
    toast.show({
      tone: STATUS_TONE[settled.status],
      title: t(`payments.status.${settled.status}`),
      description: settled.club.title,
    });
    setPendingPaymentId(null);
  }, [settled, t, toast]);

  const pay = (enrollmentId: string) => {
    const idempotencyKey = (idempotencyKeys.current[enrollmentId] ??= newRequestId());
    create.mutate(
      { enrollmentId, periodsCount: 1, idempotencyKey },
      {
        onSuccess: (created) => {
          delete idempotencyKeys.current[enrollmentId];
          setPendingPaymentId(created.paymentId);
          bridge.openLink(created.confirmationUrl);
        },
        // Ключ остаётся: повтор уйдёт с ним же.
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  return (
    <>
      <ScreenHeader
        title={t('payments.title')}
        back={isFromApp(location.state) ? true : PARENT_HOME_PATH}
        bell
      />
      <Screen>
        {/* Без выбранного ребёнка запрос выключен (вечный pending) — своё состояние. */}
        {!studentId ? (
          <NoChildState />
        ) : (
          <AsyncState
            query={query}
            isEmpty={(data) => data.periods.length === 0 && data.history.items.length === 0}
            empty={<EmptyState title={t('payments.empty')} />}
          >
            {(data) => (
              <>
                {data.periods.length > 0 && (
                  <Stack gap={2} data-tour="parent-payments">
                    <SectionTitle>{t('payments.periods')}</SectionTitle>
                    <Card padding="none">
                      {data.periods.map((period) => (
                        <ListRow
                          key={period.enrollmentId}
                          title={period.club.title}
                          subtitle={`${
                            period.paidUntil
                              ? t('courses.paidUntil', {
                                  date: formatDateOnly(period.paidUntil, i18n.language),
                                })
                              : t('courses.notPaid')
                          } · ${formatMoney(period.price, i18n.language)}`}
                          right={
                            <Button
                              size="sm"
                              // Спиннер — у нажатой строки; остальные заблокированы до ответа.
                              loading={
                                create.isPending &&
                                create.variables?.enrollmentId === period.enrollmentId
                              }
                              disabled={create.isPending}
                              onClick={() => pay(period.enrollmentId)}
                            >
                              {t('payments.pay')}
                            </Button>
                          }
                        />
                      ))}
                    </Card>
                  </Stack>
                )}

                {data.history.items.length > 0 && (
                  <Stack
                    gap={2}
                    data-tour={data.periods.length === 0 ? 'parent-payments' : undefined}
                  >
                    <SectionTitle>{t('payments.history')}</SectionTitle>
                    <Card padding="none">
                      {data.history.items.map((payment) => (
                        <ListRow
                          key={payment.id}
                          title={`${payment.club.title} · ${formatMoney(payment.amount, i18n.language)}`}
                          subtitle={`${formatDateTime(payment.createdAt, i18n.language)} · ${t('payments.periodsCount', { count: payment.periodsCount })}`}
                          right={
                            <Badge tone={STATUS_TONE[payment.status]}>
                              {t(`payments.status.${payment.status}`)}
                            </Badge>
                          }
                        />
                      ))}
                    </Card>
                  </Stack>
                )}
              </>
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}
