import {
  ATTENDANCE_QR_REFRESH_SEC,
  ATTENDANCE_QR_TTL_SEC,
  type AttendanceSheet,
} from '@edu/contracts';
import {
  Button,
  Card,
  CopyIcon,
  Inline,
  QrCode,
  Screen,
  Skeleton,
  Stack,
  Tag,
  Text,
  useToast,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useAttendanceQr, useAttendanceSheet } from '@/entities/lesson';
import { formatDate, formatTimeRange } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { useMaxBridge } from '@/shared/max';
import { QueryError, ScreenHeader } from '@/shared/ui';

/** Как часто обновляется «кто уже отметился» под кодом. */
const SHEET_POLL_MS = 5_000;

/** Отметившиеся по QR (или уже отмеченные пришедшими) — сверху экрана, пока идёт отметка. */
function CheckedIn({ sheet }: { sheet: AttendanceSheet }) {
  const { t } = useTranslation('teacher');
  const present = sheet.rows.filter((row) => row.status === 'PRESENT' || row.status === 'LATE');
  return (
    <Card>
      <Stack gap={2}>
        <Text variant="caption" tone="muted" aria-live="polite">
          {t('attendance.qr.checkedIn', { count: present.length, total: sheet.rows.length })}
        </Text>
        {present.length === 0 ? (
          <Text variant="small" tone="muted">
            {t('attendance.qr.nobodyYet')}
          </Text>
        ) : (
          <Inline gap={2}>
            {present.map((row) => (
              <Tag key={row.student.id} tone="success">
                {fullName(row.student.user)}
              </Tag>
            ))}
          </Inline>
        )}
      </Stack>
    </Card>
  );
}

/**
 * `/teacher/attendance/:lessonId/qr` — QR-код занятия на экране преподавателя (docs/07 F6a).
 * Код обновляется каждые `ATTENDANCE_QR_REFRESH_SEC`; ученики сканируют его встроенным сканером
 * MAX, ниже в реальном времени видно, кто уже отметился. «Завершить» ведёт в лист, где
 * неотсканировавшие по умолчанию «Не был».
 */
export function AttendanceQrPage() {
  const { lessonId = '' } = useParams();
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const toast = useToast();
  const bridge = useMaxBridge();
  const qr = useAttendanceQr(lessonId);
  const sheet = useAttendanceSheet(lessonId, { refetchInterval: SHEET_POLL_MS });
  const sheetPath = `/teacher/attendance/${lessonId}`;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      bridge.haptic('success');
      toast.show({
        tone: 'success',
        title: t('attendance.qr.copied', { seconds: ATTENDANCE_QR_TTL_SEC }),
      });
    } catch {
      toast.show({ tone: 'warning', title: t('attendance.qr.copyFailed') });
    }
  };

  const lesson = sheet.data?.lesson;

  let code;
  if (qr.data) {
    code = (
      <Stack gap={3} align="center">
        <QrCode value={qr.data.url} label={t('attendance.qr.label')} size={320} />
        {/* Обновление не удалось — показываем прежний код, пока он жив, и предупреждаем. */}
        {qr.isError && (
          <Text variant="small" tone="warning" align="center">
            {t('attendance.qr.stale')}
          </Text>
        )}
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<CopyIcon />}
          onClick={() => void copy(qr.data.url)}
        >
          {t('attendance.qr.copy')}
        </Button>
      </Stack>
    );
  } else if (qr.isError) {
    code = <QueryError error={qr.error} onRetry={() => void qr.refetch()} />;
  } else {
    code = <Skeleton height={280} aria-busy="true" />;
  }

  return (
    <>
      <ScreenHeader title={t('attendance.qr.title')} back={sheetPath} />
      <Screen fill>
        <Stack gap={4} grow>
          <Card>
            <Stack gap={3}>
              {lesson && (
                <Stack gap={1}>
                  <Text variant="title">{lesson.group.title}</Text>
                  <Text tone="muted">
                    {formatDate(lesson.startsAt, i18n.language)} ·{' '}
                    {formatTimeRange(lesson.startsAt, lesson.endsAt, i18n.language)}
                    {lesson.topic ? ` · ${lesson.topic}` : ''}
                  </Text>
                </Stack>
              )}
              {code}
              <Text variant="small" tone="muted">
                {t('attendance.qr.hint')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('attendance.qr.refresh', { seconds: ATTENDANCE_QR_REFRESH_SEC })}
              </Text>
            </Stack>
          </Card>

          {sheet.data && <CheckedIn sheet={sheet.data} />}

          <Stack gap={2} justify="end" grow>
            <Text variant="caption" tone="muted" align="center">
              {t('attendance.qr.finishHint')}
            </Text>
            <Button
              fullWidth
              size="lg"
              onClick={() => navigate(sheetPath, { replace: true, state: { unmarked: 'ABSENT' } })}
            >
              {t('attendance.qr.finish')}
            </Button>
          </Stack>
        </Stack>
      </Screen>
    </>
  );
}
