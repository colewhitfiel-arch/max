import { type CheckInFailureReason, CheckInFailureReasonSchema } from '@edu/contracts';
import {
  AlertIcon,
  AppLayout,
  Button,
  CheckIcon,
  EmptyState,
  IconTile,
  PageHeader,
  QrCodeIcon,
  Screen,
  Spinner,
  Stack,
  Text,
  UsersIcon,
} from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useCheckIn } from '@/entities/lesson';
import { ManualCheckInSheet, useScanCheckIn } from '@/features/qr-check-in';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { roleHomePath } from '@/shared/auth/role-routes';
import { formatTimeRange } from '@/shared/lib/dates';
import { useMaxBridge } from '@/shared/max';

/** Причина отказа из `details.reason` ответа 422; null — другая ошибка (сеть, 5xx). */
function failureReason(error: unknown): CheckInFailureReason | null {
  if (!isApiClientError(error) || error.code !== 'BUSINESS_RULE') return null;
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  const parsed = CheckInFailureReasonSchema.safeParse(reason);
  return parsed.success ? parsed.data : null;
}

function GoHomeButton({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const { t } = useTranslation('student');
  const { me } = useAuth();
  const navigate = useNavigate();
  return (
    <Button
      variant={variant}
      fullWidth
      onClick={() => navigate(roleHomePath(me?.activeRole), { replace: true })}
    >
      {t('checkIn.goHome')}
    </Button>
  );
}

/** Ученик на экране: код уходит на сервер один раз, дальше — итог или причина отказа. */
function StudentCheckIn({ code }: { code: string }) {
  const { t, i18n } = useTranslation('student');
  const bridge = useMaxBridge();
  const checkIn = useCheckIn();
  // Повторный скан — новый код и новый экран (replace), а не второй экран отметки в истории.
  const rescan = useScanCheckIn({ replace: true });
  const sent = useRef(false);
  const { mutate } = checkIn;

  useEffect(() => {
    // StrictMode вызывает эффект дважды — отметка уходит один раз (сервер и так идемпотентен).
    if (sent.current) return;
    sent.current = true;
    mutate(
      { code },
      {
        onSuccess: () => bridge.haptic('success'),
        onError: () => bridge.haptic('error'),
      },
    );
  }, [bridge, mutate, code]);

  if (checkIn.isSuccess) {
    const { lesson, alreadyMarked } = checkIn.data;
    return (
      <EmptyState
        icon={
          <IconTile tone="success" size="xl">
            <CheckIcon />
          </IconTile>
        }
        title={t(alreadyMarked ? 'checkIn.already' : 'checkIn.done')}
        description={
          <Stack gap={1} align="center">
            <Text align="center">
              {t('checkIn.lesson', {
                club: lesson.group.club.title,
                time: formatTimeRange(lesson.startsAt, lesson.endsAt, i18n.language),
              })}
            </Text>
            <Text variant="small" tone="muted" align="center">
              {t(alreadyMarked ? 'checkIn.alreadyHint' : 'checkIn.doneHint')}
            </Text>
          </Stack>
        }
        action={<GoHomeButton variant="primary" />}
      />
    );
  }

  if (checkIn.isError) {
    const reason = failureReason(checkIn.error);
    const canRescan = reason === 'CODE_INVALID' || reason === 'CODE_EXPIRED' || reason === null;
    return (
      <>
        <EmptyState
          icon={
            <IconTile tone="warning" size="xl">
              <AlertIcon />
            </IconTile>
          }
          title={reason ? t(`checkIn.errors.${reason}.title`) : t('checkIn.failed')}
          description={
            reason ? t(`checkIn.errors.${reason}.hint`) : describeApiError(checkIn.error)
          }
          action={
            <Stack gap={2}>
              {canRescan && (
                <Button
                  fullWidth
                  leftIcon={<QrCodeIcon />}
                  loading={rescan.scanning}
                  onClick={() => void rescan.scan()}
                >
                  {t('checkIn.scanAgain')}
                </Button>
              )}
              <GoHomeButton />
            </Stack>
          }
        />
        <ManualCheckInSheet
          open={rescan.manualOpen}
          onClose={rescan.closeManual}
          onCode={rescan.openCode}
        />
      </>
    );
  }

  return (
    <Stack gap={3} align="center" aria-busy="true">
      <Spinner />
      <Text tone="muted">{t('checkIn.pending')}</Text>
    </Stack>
  );
}

/**
 * `/check-in/:code` — отметка на занятии по коду из QR (docs/07 F6a). Сюда ведут встроенный
 * сканер MAX с главной ученика и диплинк `https://max.ru/<бот>?startapp=checkin_<код>`
 * (обычная камера телефона). Проверку — подпись и срок кода, отменённое занятие, состав
 * группы — делает сервер; экран показывает итог. Не ученик — подсказка.
 */
export function CheckInPage() {
  const { t } = useTranslation('student');
  const { code = '' } = useParams();
  const { me } = useAuth();
  const isStudent = me?.activeRole === 'STUDENT';

  return (
    <AppLayout header={<PageHeader title={t('checkIn.title')} />}>
      <AppLayout.Content>
        <Screen fill>
          <Stack grow justify="center">
            {isStudent ? (
              <StudentCheckIn key={code} code={code} />
            ) : (
              <EmptyState
                icon={
                  <IconTile tone="info" size="xl">
                    <UsersIcon />
                  </IconTile>
                }
                title={t('checkIn.notStudent')}
                description={t('checkIn.notStudentHint')}
                action={<GoHomeButton />}
              />
            )}
          </Stack>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
