import {
  TEACHER_WALLET_DEFAULT_PERIOD,
  TEACHER_WALLET_PERIODS,
  TEACHER_WITHDRAW_MIN_KOPECKS,
  type GroupBrief,
  type TeacherDebt,
  type TeacherWallet,
  type TeacherWalletPeriod,
  type TeacherWalletTransaction,
} from '@edu/contracts';
import {
  Avatar,
  Button,
  CardColumns,
  CloseIcon,
  EmptyState,
  Inline,
  LineChart,
  Screen,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  VisuallyHidden,
  WalletHero,
  type CardColumn,
  type CardColumnsRow,
} from '@edu/ui';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useTeacherWallet } from '@/entities/payment';
import { shortName } from '@/entities/student';
import { WithdrawSheet } from '@/features/withdraw-wallet';
import { useMe } from '@/shared/auth/hooks';
import { diffCalendarDays, formatDate, formatTime } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { formatMoney, wholeRubles } from '@/shared/lib/money';
import { isFromApp } from '@/shared/lib/navigation';
import { TEACHER_HOME_PATH } from '@/shared/lib/teacher-paths';
import { QueryError, ScreenHeader } from '@/shared/ui';
import {
  balanceSeries,
  formatDueDate,
  isOverdue,
  openingBalance,
  transactionsByDay,
} from '../model';

/**
 * Доли ширины колонок: все блоки транзакций по дням и «Вам должны» выровнены между собой.
 * В макете (52 / 125 / 68 / 76 px) группа подписана кодом «001»; без кода это название
 * («Робототехника, группа А»), поэтому группе — самая широкая колонка: на 375–390px слова
 * не рвутся по буквам, а суммы и даты dd.MM.yy помещаются в строку.
 */
const COLUMN_WEIGHTS = { group: 118, student: 88, amount: 56, last: 60 } as const;

function isPeriod(value: string): value is TeacherWalletPeriod {
  return (TEACHER_WALLET_PERIODS as readonly string[]).includes(value);
}

/** Короткий номер группы («001»), если его нет — название. */
function groupLabel(group: GroupBrief): string {
  return group.code ?? group.title;
}

/**
 * `/teacher/wallet` — кошелёк репетитора (макет 59:16, заглушка до PaymentProvider): крупный
 * баланс с кнопкой «Вывести» (шторка вывода), график «Изменение баланса» за 1 / 7 / 30 дней,
 * транзакции за период по дням и «Вам должны». «Баланс ✕» закрывает экран: открыт из
 * приложения — назад по истории, по прямой ссылке — на главную.
 */
export function TeacherWalletPage() {
  const { t, i18n } = useTranslation('teacher-wallet');
  const locale = i18n.language;
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const [period, setPeriod] = useState<TeacherWalletPeriod>(TEACHER_WALLET_DEFAULT_PERIOD);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const wallet = useTeacherWallet(period);
  const transactionsId = useId();
  const debtsId = useId();

  const data = wallet.data;
  const balance = data?.balance;
  const failed = wallet.isError && !data;
  // Пока новое окно грузится, на экране прежние данные — помечаем их как обновляющиеся.
  const busy = wallet.isPlaceholderData || undefined;
  const user = me?.user;

  const close = () => {
    if (isFromApp(location.state)) void navigate(-1);
    else void navigate(TEACHER_HOME_PATH, { replace: true });
  };

  return (
    <>
      <ScreenHeader
        variant="solid"
        title={
          user ? (
            <Inline as="span" gap={2} align="center" wrap={false}>
              {/* Имя уже в заголовке текстом — аватар для скринридера не дублируем. */}
              <Avatar name={fullName(user)} src={user.avatarUrl} aria-hidden="true" />
              <VisuallyHidden>{t('title')}: </VisuallyHidden>
              <Text as="span" truncate>
                {shortName(user)}
              </Text>
            </Inline>
          ) : (
            t('title')
          )
        }
        actions={
          <Button
            variant="link"
            aria-label={t('closeLabel')}
            rightIcon={<CloseIcon size={23} />}
            onClick={close}
          >
            {t('close')}
          </Button>
        }
      />
      <Screen gap={3}>
        <Inline gap={6} align="start" wrap={false} data-tour="teacher-wallet">
          <WalletHero
            amount={balance ? wholeRubles(balance, locale) : failed ? '—' : '…'}
            aria-label={
              balance
                ? t('balance', { amount: formatMoney(balance, locale) })
                : failed
                  ? undefined
                  : t('balanceLoading')
            }
            actionLabel={t('withdraw')}
            actionDisabled={!balance || balance.amountKopecks < TEACHER_WITHDRAW_MIN_KOPECKS}
            onAction={() => setWithdrawOpen(true)}
          />
          <Stack grow gap={3}>
            <Inline justify="center">
              <SegmentedControl
                aria-label={t('periodLabel')}
                variant="accent"
                options={TEACHER_WALLET_PERIODS.map((value) => ({
                  value,
                  label: t(`periods.${value}`),
                }))}
                value={period}
                onChange={(value) => {
                  if (isPeriod(value)) setPeriod(value);
                }}
              />
            </Inline>
            {data ? (
              <BalanceChart wallet={data} busy={busy} />
            ) : failed ? null : (
              <Skeleton height={111} aria-busy="true" />
            )}
          </Stack>
        </Inline>

        {failed ? (
          <QueryError error={wallet.error} onRetry={() => void wallet.refetch()} />
        ) : (
          <>
            <Stack as="section" gap={3} aria-labelledby={transactionsId} aria-busy={busy}>
              <Text id={transactionsId} as="h2" variant="caption" weight="bold">
                {t('transactions.title')}
              </Text>
              {data ? (
                <Transactions transactions={data.transactions} />
              ) : (
                <Skeleton height={150} aria-busy="true" />
              )}
            </Stack>
            <Stack as="section" gap={3} aria-labelledby={debtsId} aria-busy={busy}>
              <Text id={debtsId} as="h2" variant="caption" weight="bold">
                {t('debts.title')}
              </Text>
              {data ? (
                <Debts debts={data.debts} labelledBy={debtsId} />
              ) : (
                <Skeleton height={110} aria-busy="true" />
              )}
            </Stack>
          </>
        )}
      </Screen>
      {balance && (
        <WithdrawSheet
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          balance={balance}
        />
      )}
    </>
  );
}

/** «Изменение баланса»: ступенчатая линия за период, подписи осей — по периоду из ответа. */
function BalanceChart({ wallet, busy }: { wallet: TeacherWallet; busy?: boolean }) {
  const { t, i18n } = useTranslation('teacher-wallet');
  const locale = i18n.language;
  const series = useMemo(() => balanceSeries(wallet, locale), [wallet, locale]);
  const points = series.values.map((value, index) => ({ key: String(index), value }));
  return (
    <LineChart
      title={t('chart.title')}
      aria-label={t('chart.label', {
        period: t(`periods.${wallet.period}`),
        from: formatMoney(openingBalance(wallet), locale),
        to: formatMoney(wallet.balance, locale),
      })}
      aria-busy={busy}
      points={points}
      xLabels={series.labels}
      formatTick={(rubles) => wholeRubles(Math.round(rubles * 100), locale)}
      step
    />
  );
}

/** Транзакции периода блоками по дням: подпись дня справа, заголовки колонок — у первого блока. */
function Transactions({ transactions }: { transactions: TeacherWalletTransaction[] }) {
  const { t, i18n } = useTranslation('teacher-wallet');
  const locale = i18n.language;
  const days = useMemo(() => transactionsByDay(transactions), [transactions]);

  if (days.length === 0) return <EmptyState title={t('transactions.empty')} />;

  const columns: CardColumn[] = [
    { key: 'group', header: t('columns.group'), align: 'center', weight: COLUMN_WEIGHTS.group },
    { key: 'student', header: t('columns.student'), weight: COLUMN_WEIGHTS.student },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'center',
      nowrap: true,
      weight: COLUMN_WEIGHTS.amount,
    },
    {
      key: 'time',
      header: t('columns.time'),
      align: 'center',
      nowrap: true,
      weight: COLUMN_WEIGHTS.last,
    },
  ];

  const now = new Date();
  const dayCaption = (date: Date): string => {
    const daysAgo = diffCalendarDays(date, now);
    if (daysAgo === 0) return t('transactions.today');
    if (daysAgo === 1) return t('transactions.yesterday');
    return formatDate(date, locale);
  };

  const row = (transaction: TeacherWalletTransaction): CardColumnsRow => {
    const withdrawal = transaction.kind === 'WITHDRAWAL';
    return {
      key: transaction.id,
      tone: withdrawal ? 'danger' : undefined,
      cells: {
        group: withdrawal ? (
          <Text as="span" variant="caption" tone="danger">
            —
          </Text>
        ) : transaction.group ? (
          groupLabel(transaction.group)
        ) : (
          '—'
        ),
        student: withdrawal
          ? t('transactions.withdrawal')
          : transaction.student
            ? shortName(transaction.student.user)
            : '—',
        amount: (
          <Text
            as="span"
            variant="caption"
            weight="medium"
            tone={withdrawal ? 'danger' : 'success'}
          >
            {wholeRubles(transaction.amount, locale)}
          </Text>
        ),
        time: formatTime(transaction.at, locale),
      },
    };
  };

  return (
    <Stack gap={3}>
      {days.map((day, index) => {
        const caption = dayCaption(day.date);
        return (
          <CardColumns
            key={day.key}
            aria-label={t('transactions.dayLabel', { day: caption })}
            caption={caption}
            variant="compact"
            striped={day.stripes}
            showHeader={index === 0}
            columns={columns}
            rows={day.items.map(row)}
          />
        );
      })}
    </Stack>
  );
}

/** «Вам должны»: суммы цветом акцента, просроченная дата — красная (и словом для скринридера). */
function Debts({ debts, labelledBy }: { debts: TeacherDebt[]; labelledBy: string }) {
  const { t, i18n } = useTranslation('teacher-wallet');
  const locale = i18n.language;

  if (debts.length === 0) {
    return (
      <Text variant="small" tone="muted">
        {t('debts.empty')}
      </Text>
    );
  }

  const columns: CardColumn[] = [
    { key: 'group', header: t('columns.group'), align: 'center', weight: COLUMN_WEIGHTS.group },
    { key: 'student', header: t('columns.student'), weight: COLUMN_WEIGHTS.student },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'center',
      nowrap: true,
      weight: COLUMN_WEIGHTS.amount,
    },
    {
      key: 'date',
      header: t('columns.date'),
      align: 'center',
      nowrap: true,
      weight: COLUMN_WEIGHTS.last,
    },
  ];

  const now = new Date();
  const dueCell = (dueAt: string): ReactNode => {
    const date = formatDueDate(dueAt, locale);
    if (!isOverdue(dueAt, now)) return date;
    return (
      <Text as="span" variant="caption" tone="danger">
        {date}
        <VisuallyHidden>, {t('debts.overdue')}</VisuallyHidden>
      </Text>
    );
  };

  return (
    <CardColumns
      aria-labelledby={labelledBy}
      variant="compact"
      // Как в макете: у «Вам должны» подложена вторая строка (и далее через одну).
      striped="even"
      columns={columns}
      rows={debts.map((debt) => ({
        key: debt.id,
        cells: {
          group: groupLabel(debt.group),
          student: shortName(debt.student.user),
          amount: (
            <Text as="span" variant="caption" weight="medium" tone="primary">
              {wholeRubles(debt.amount, locale)}
            </Text>
          ),
          date: dueCell(debt.dueAt),
        },
      }))}
    />
  );
}
