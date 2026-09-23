import { WALLET_TOPUP_MAX_KOPECKS, WALLET_TOPUP_MIN_KOPECKS } from '@edu/contracts';
import {
  Button,
  Card,
  Chip,
  Field,
  Inline,
  Input,
  Screen,
  Skeleton,
  Stack,
  Tag,
  Text,
  useToast,
} from '@edu/ui';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useTopUpWallet, useWallet } from '@/entities/payment';
import { newRequestId } from '@/shared/api/client';
import { describeApiError } from '@/shared/api/errors';
import { formatMoney, rublesToKopecks } from '@/shared/lib/money';
import { useMaxBridge } from '@/shared/max';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { isFromApp } from '../paths';

/** Быстрый выбор суммы, ₽. */
const PRESETS_RUBLES = [500, 1000, 3000, 5000] as const;
/** Длиннее максимума (100 000 ₽ — 6 цифр) вводить нет смысла, но 7-я цифра даёт понятную ошибку. */
const MAX_DIGITS = 7;

type AmountError = 'invalid' | 'tooSmall' | 'tooLarge';

/** Сумма из поля (только цифры) → копейки и ошибка по пределам контракта. */
function parseAmount(value: string): { kopecks: number | null; error: AmountError | null } {
  if (!value) return { kopecks: null, error: 'invalid' };
  const kopecks = rublesToKopecks(Number(value));
  if (kopecks < WALLET_TOPUP_MIN_KOPECKS) return { kopecks, error: 'tooSmall' };
  if (kopecks > WALLET_TOPUP_MAX_KOPECKS) return { kopecks, error: 'tooLarge' };
  return { kopecks, error: null };
}

/**
 * `/parent/wallet` — пополнение кошелька родителя (заглушка, docs/07 F13): текущий баланс,
 * «На сколько хотите пополнить?», сумма с быстрым выбором, `POST /parent/wallet/top-up`
 * с Idempotency-Key. Провайдера нет — баланс пополняется сразу, о чём честно сказано на экране.
 */
export function WalletTopUpPage() {
  const { t, i18n } = useTranslation('parent-home');
  const locale = i18n.language;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const bridge = useMaxBridge();
  const wallet = useWallet();
  const topUp = useTopUpWallet();

  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);
  /** Один ключ на попытку: повтор после сбоя сети с той же суммой не зачислит дважды. */
  const idempotencyKey = useRef<string | null>(null);

  const { kopecks, error } = parseAmount(amount);
  const limits = {
    min: formatMoney(WALLET_TOPUP_MIN_KOPECKS, locale),
    max: formatMoney(WALLET_TOPUP_MAX_KOPECKS, locale),
  };
  // Ошибку пустого поля показываем только после попытки отправить; пределы — сразу.
  const shownError =
    error && (submitted || error !== 'invalid') ? t(`wallet.${error}`, limits) : undefined;

  const changeAmount = (next: string) => {
    setAmount(next.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS));
    idempotencyKey.current = null;
  };

  const goBack = () => {
    // Пришли с главной или из настроек — назад по истории; иначе (прямая ссылка, вход) — на главную.
    if (isFromApp(location.state)) void navigate(-1);
    else void navigate('/parent', { replace: true });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (error || kopecks === null || topUp.isPending) return;
    idempotencyKey.current ??= newRequestId();
    topUp.mutate(
      { amountKopecks: kopecks, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: () => {
          idempotencyKey.current = null;
          bridge.haptic('success');
          toast.show({ tone: 'success', title: t('wallet.success') });
          goBack();
        },
        onError: (cause) => toast.show({ tone: 'danger', title: describeApiError(cause) }),
      },
    );
  };

  return (
    <>
      <ScreenHeader title={t('wallet.title')} back="/parent" />
      <Screen gap={5}>
        <Card>
          <Stack gap={1}>
            <Text variant="caption" tone="muted">
              {t('wallet.balance')}
            </Text>
            <AsyncState query={wallet} skeleton={<Skeleton height={32} width="45%" />}>
              {(data) => (
                <Text variant="heading" as="p">
                  {formatMoney(data.balance, locale)}
                </Text>
              )}
            </AsyncState>
          </Stack>
        </Card>

        <form onSubmit={onSubmit} noValidate>
          <Stack gap={4}>
            <Text variant="title" as="h2">
              {t('wallet.question')}
            </Text>
            <Field label={t('wallet.amount')} hint={t('wallet.limits', limits)} error={shownError}>
              <Input
                value={amount}
                onChange={(event) => changeAmount(event.target.value)}
                placeholder={t('wallet.amountPlaceholder')}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
              />
            </Field>
            <Inline gap={2} role="group" aria-label={t('wallet.presets')}>
              {PRESETS_RUBLES.map((rubles) => (
                <Chip
                  key={rubles}
                  type="button"
                  selected={amount === String(rubles)}
                  onClick={() => changeAmount(String(rubles))}
                >
                  {formatMoney(rublesToKopecks(rubles), locale)}
                </Chip>
              ))}
            </Inline>
            <Card>
              <Stack gap={2} align="start">
                <Tag tone="info">{t('wallet.stubTitle')}</Tag>
                <Text variant="small" tone="muted">
                  {t('wallet.stub')}
                </Text>
              </Stack>
            </Card>
            <Button type="submit" size="lg" fullWidth loading={topUp.isPending}>
              {kopecks !== null && !error
                ? t('wallet.submitAmount', { amount: formatMoney(kopecks, locale) })
                : t('wallet.submit')}
            </Button>
          </Stack>
        </form>
      </Screen>
    </>
  );
}
