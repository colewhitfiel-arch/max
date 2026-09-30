import {
  type AttendanceSheet,
  type AttendanceStatus,
  ATTENDANCE_STATUSES,
  type MarkAttendanceRow,
} from '@edu/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Inline,
  QrCodeIcon,
  Screen,
  SegmentedControl,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { attendanceTone, useAttendanceSheet, useMarkAttendance } from '@/entities/lesson';
import { describeApiError } from '@/shared/api/errors';
import { formatDate, formatTimeRange, isSameDay } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** По умолчанию считаем, что пришли все: преподаватель отмечает только тех, кого не было. */
const DEFAULT_STATUS: AttendanceStatus = 'PRESENT';

type Marks = Record<string, AttendanceStatus>;

/** Уже проставленные отметки сохраняем, остальным ставим `unmarked` («пришёл», после QR — «не был»). */
function initialMarks(sheet: AttendanceSheet, unmarked: AttendanceStatus): Marks {
  return Object.fromEntries(sheet.rows.map((row) => [row.student.id, row.status ?? unmarked]));
}

/**
 * Статус неотмеченных по умолчанию. После отметки по QR-коду (экран QR передаёт
 * `state.unmarked`) кто не отсканировал код — «не был», иначе все считаются пришедшими.
 */
function unmarkedStatus(state: unknown): AttendanceStatus {
  const requested = (state as { unmarked?: unknown } | null)?.unmarked;
  return requested === 'ABSENT' ? 'ABSENT' : DEFAULT_STATUS;
}

const studentName = (user: { firstName: string; lastName: string | null }) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ');

/**
 * `/teacher/attendance/:lessonId` — лист посещаемости (docs/07 F6, шаг 2).
 * Все по умолчанию «пришли», преподаватель меняет только отличия и сохраняет разом:
 * `PUT` перезаписывает лист целиком, поэтому повторное сохранение безопасно. В день занятия —
 * «QR-код для отметки»: ученики отмечаются сами (F6a), лист дозаполняется здесь.
 */
export function AttendanceSheetPage() {
  const { lessonId = '' } = useParams();
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const query = useAttendanceSheet(lessonId);
  const mark = useMarkAttendance(lessonId);
  const [marks, setMarks] = useState<Marks | null>(null);
  const unmarked = unmarkedStatus(location.state);

  // Лист пришёл (или обновился после сохранения) — берём его отметки за основу.
  useEffect(() => {
    if (query.data) setMarks(initialMarks(query.data, unmarked));
  }, [query.data, unmarked]);

  const setAll = (status: AttendanceStatus) => {
    if (!query.data) return;
    setMarks(Object.fromEntries(query.data.rows.map((row) => [row.student.id, status])));
  };

  const onSave = (sheet: AttendanceSheet) => {
    const rows: MarkAttendanceRow[] = sheet.rows.map((row) => ({
      studentId: row.student.id,
      status: marks?.[row.student.id] ?? row.status ?? unmarked,
    }));
    mark.mutate(
      { rows },
      {
        onSuccess: () => {
          toast.show({ tone: 'success', title: t('attendance.saved') });
          navigate('/teacher/attendance');
        },
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  return (
    <>
      <ScreenHeader title={t('attendance.title')} back="/teacher/attendance" />
      <Screen fill>
        <AsyncState query={query}>
          {(sheet) => {
            const current = marks ?? initialMarks(sheet, unmarked);
            const counts = ATTENDANCE_STATUSES.map((status) => ({
              status,
              count: sheet.rows.filter((row) => current[row.student.id] === status).length,
            })).filter((item) => item.count > 0);
            // QR-код выдаётся только в день занятия и не для отменённого (так же решает сервер).
            const canShowQr =
              sheet.lesson.status !== 'CANCELLED' && isSameDay(sheet.lesson.startsAt, new Date());
            return (
              <Stack gap={4} grow>
                <Card>
                  <Stack gap={2}>
                    <Text variant="title">{sheet.lesson.group.title}</Text>
                    <Text tone="muted">
                      {formatDate(sheet.lesson.startsAt, i18n.language)} ·{' '}
                      {formatTimeRange(sheet.lesson.startsAt, sheet.lesson.endsAt, i18n.language)}
                      {sheet.lesson.topic ? ` · ${sheet.lesson.topic}` : ''}
                    </Text>
                    <Inline gap={2}>
                      {counts.map(({ status, count }) => (
                        <Badge key={status} tone={attendanceTone(status)}>
                          {t(`attendance.status.${status}`)}: {count}
                        </Badge>
                      ))}
                    </Inline>
                  </Stack>
                </Card>

                {canShowQr && (
                  <Button
                    variant="secondary"
                    fullWidth
                    leftIcon={<QrCodeIcon />}
                    onClick={() => navigate(`/teacher/attendance/${lessonId}/qr`)}
                  >
                    {t('attendance.qr.open')}
                  </Button>
                )}

                <Inline gap={2}>
                  <Button variant="secondary" size="sm" onClick={() => setAll('PRESENT')}>
                    {t('attendance.allPresent')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAll('ABSENT')}>
                    {t('attendance.allAbsent')}
                  </Button>
                </Inline>

                <Card>
                  <Stack gap={3}>
                    {sheet.rows.map((row, index) => (
                      <Stack key={row.student.id} gap={2}>
                        {index > 0 && <Divider />}
                        <Inline gap={2}>
                          <Avatar
                            size="sm"
                            src={row.student.user.avatarUrl}
                            name={studentName(row.student.user)}
                          />
                          <Text>{studentName(row.student.user)}</Text>
                        </Inline>
                        <SegmentedControl
                          fullWidth
                          size="sm"
                          aria-label={studentName(row.student.user)}
                          value={current[row.student.id] ?? unmarked}
                          onChange={(value) =>
                            setMarks({
                              ...current,
                              [row.student.id]: value as AttendanceStatus,
                            })
                          }
                          options={ATTENDANCE_STATUSES.map((status) => ({
                            value: status,
                            label: t(`attendance.statusShort.${status}`),
                          }))}
                        />
                      </Stack>
                    ))}
                  </Stack>
                </Card>

                <Stack gap={2} justify="end" grow>
                  <Button
                    fullWidth
                    size="lg"
                    loading={mark.isPending}
                    onClick={() => onSave(sheet)}
                  >
                    {t('attendance.save')}
                  </Button>
                </Stack>
              </Stack>
            );
          }}
        </AsyncState>
      </Screen>
    </>
  );
}
