import { TEACHER_WITHDRAW_MIN_KOPECKS, type Money } from '@edu/contracts';
import {
  Button,
  Card,
  Chip,
  Field,
  Inline,
  Input,
  Sheet,
  Stack,
  Tag,
  Text,
  useToast,
} from '@edu/ui';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useWithdrawTeacherWallet } from '@/entities/payment';
import { newRequestId } from '@/shared/api/client';
import { describeApiError } from '@/shared/api/errors';
import { formatMoney, rublesToKopecks } from '@/shared/lib/money';
import { useMaxBridge } from '@/shared/max';

/** Быстрый выбор суммы, ₽ (плюс «Всё» — весь баланс целыми рублями). */
const PRESETS_RUBLES = [1000, 3000, 5000] as const;
/** До миллиарда рублей — дальше ввод не нужен; всё, что больше баланса, и так ошибка. */
const MAX_DIGITS = 9;

type AmountError = 'invalid' | 'tooSmall' | 'tooLarge';

/** Сумма из поля (только цифры) → копейки и ошибка: минимум контракта, максимум — баланс. */
function parseAmount(
  value: string,
  maxKopecks: number,
): { kopecks: number | null; error: AmountError | null } {
  if (!value) return { kopecks: null, error: 'invalid' };
  const kopecks = rublesToKopecks(Number(value));
  if (kopecks < TEACHER_WITHDRAW_MIN_KOPECKS) return { kopecks, error: 'tooSmall' };
  if (kopecks > maxKopecks) return { kopecks, error: 'tooLarge' };
  return { kopecks, error: null };
}

export interface WithdrawSheetProps {
  open: boolean;
  onClose: () => void;
  /** Текущий баланс кошелька — верхний предел вывода. */
  balance: Money;
}

/**
 * «Вывести» в кошельке репетитора (заглушка до PaymentProvider): сумма целыми рублями
 * (100 ₽ … баланс) с быстрым выбором, `POST /teacher/wallet/withdraw` с Idempotency-Key.
 * Реального перевода нет — баланс уменьшается сразу, о чём честно сказано в шторке.
 * Форма живёт, только пока шторка открыта: при следующем открытии — пустое поле и новый ключ.
 * Пока запрос в полёте, шторку не закрыть (иначе повтор с новым ключом спишет дважды);
 * тост и отклик — на уровне мутации, поэтому итог виден, даже если ушли с экрана.
 */
export function WithdrawSheet({ open, onClose, balance }: WithdrawSheetProps) {
  const { t } = useTranslation('teacher-wallet');
  const toast = useToast();
  const bridge = useMaxBridge();
  const withdraw = useWithdrawTeacherWallet({
    onSuccess: () => {
      bridge.haptic('success');
      toast.show({ tone: 'success', title: t('withdrawSheet.success') });
    },
    onError: (cause) => toast.show({ tone: 'danger', title: describeApiError(cause) }),
  });
  const closable = !withdraw.isPending;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('withdrawSheet.title')}
      closeLabel={t('common:actions.close')}
      closeOnBackdrop={closable}
      closeOnEscape={closable}
      showClose={closable}
    >
      <WithdrawForm balance={balance} withdraw={withdraw} onDone={onClose} />
    </Sheet>
  );
}

interface WithdrawFormProps {
  balance: Money;
  withdraw: ReturnType<typeof useWithdrawTeacherWallet>;
  onDone: () => void;
}

function WithdrawForm({ balance, withdraw, onDone }: WithdrawFormProps) {
  const { t, i18n } = useTranslation('teacher-wallet');
  const locale = i18n.language;

  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);
  /** Один ключ на попытку: повтор после сбоя сети с той же суммой не спишет дважды. */
  const idempotencyKey = useRef<string | null>(null);

  const maxKopecks = balance.amountKopecks;
  /** «Всё» — баланс целыми рублями: копейки вывести нельзя (сумма вводится в рублях). */
  const allRubles = Math.floor(maxKopecks / 100);
  const { kopecks, error } = parseAmount(amount, maxKopecks);
  const limits = {
    min: formatMoney(TEACHER_WITHDRAW_MIN_KOPECKS, locale),
    max: formatMoney(rublesToKopecks(allRubles), locale),
  };
  // Ошибку пустого поля показываем только после попытки отправить; пределы — сразу.
  const shownError =
    error && (submitted || error !== 'invalid') ? t(`withdrawSheet.${error}`, limits) : undefined;

  /** Новая попытка (и новый ключ) — только если сумма действительно поменялась. */
  const changeAmount = (next: string) => {
    const normalized = next.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS);
    if (normalized === amount) return;
    setAmount(normalized);
    idempotencyKey.current = null;
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (error || kopecks === null || withdraw.isPending) return;
    idempotencyKey.current ??= newRequestId();
    withdraw.mutate(
      { amountKopecks: kopecks, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: () => {
          idempotencyKey.current = null;
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={4}>
        <Text variant="small" tone="muted">
          {t('withdrawSheet.available', { amount: formatMoney(balance, locale) })}
        </Text>
        <Field
          label={t('withdrawSheet.amount')}
          hint={t('withdrawSheet.limits', limits)}
          error={shownError}
        >
          <Input
            value={amount}
            onChange={(event) => changeAmount(event.target.value)}
            placeholder={t('withdrawSheet.amountPlaceholder')}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
          />
        </Field>
        <Inline gap={2} role="group" aria-label={t('withdrawSheet.presets')}>
          {PRESETS_RUBLES.map((rubles) => (
            <Chip
              key={rubles}
              type="button"
              selected={amount === String(rubles)}
              disabled={rubles > allRubles}
              onClick={() => changeAmount(String(rubles))}
            >
              {formatMoney(rublesToKopecks(rubles), locale)}
            </Chip>
          ))}
          <Chip
            type="button"
            selected={amount !== '' && amount === String(allRubles)}
            disabled={allRubles === 0}
            aria-label={t('withdrawSheet.allLabel', {
              amount: formatMoney(rublesToKopecks(allRubles), locale),
            })}
            onClick={() => changeAmount(String(allRubles))}
          >
            {t('withdrawSheet.all')}
          </Chip>
        </Inline>
        <Card>
          <Stack gap={2} align="start">
            <Tag tone="info">{t('withdrawSheet.stubTitle')}</Tag>
            <Text variant="small" tone="muted">
              {t('withdrawSheet.stub')}
            </Text>
          </Stack>
        </Card>
        <Button type="submit" size="lg" fullWidth loading={withdraw.isPending}>
          {kopecks !== null && !error
            ? t('withdrawSheet.submitAmount', { amount: formatMoney(kopecks, locale) })
            : t('withdrawSheet.submit')}
        </Button>
      </Stack>
    </form>
  );
}
