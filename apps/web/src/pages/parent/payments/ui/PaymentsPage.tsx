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
import { useTranslation } from 'react-i18next';
import { useChildPayments, useCreatePayment } from '@/entities/payment';
import { NoChildState } from '@/features/link-child';
import { describeApiError } from '@/shared/api/errors';
import { formatDate, formatDateTime } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
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
  const studentId = useSelectedChildId();
  const query = useChildPayments(studentId);
  const create = useCreatePayment(studentId);

  const pay = (enrollmentId: string) =>
    create.mutate(
      { enrollmentId, periodsCount: 1 },
      {
        onSuccess: (result) => bridge.openLink(result.confirmationUrl),
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );

  return (
    <>
      <ScreenHeader title={t('payments.title')} bell />
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
                <Stack gap={2}>
                  <SectionTitle>{t('payments.periods')}</SectionTitle>
                  <Card padding="none">
                    {data.periods.map((period) => (
                      <ListRow
                        key={period.enrollmentId}
                        title={period.club.title}
                        subtitle={`${
                          period.paidUntil
                            ? t('courses.paidUntil', {
                                date: formatDate(period.paidUntil, i18n.language),
                              })
                            : t('courses.notPaid')
                        } · ${formatMoney(period.price, i18n.language)}`}
                        right={
                          <Button
                            size="sm"
                            loading={create.isPending}
                            onClick={() => pay(period.enrollmentId)}
                          >
                            {t('payments.pay')}
                          </Button>
                        }
                      />
                    ))}
                  </Card>
                </Stack>

                {data.history.items.length > 0 && (
                  <Stack gap={2}>
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
