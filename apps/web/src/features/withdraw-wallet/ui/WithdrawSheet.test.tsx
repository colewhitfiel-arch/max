import { ToastProvider } from '@edu/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { ApiClientError } from '@/shared/api/errors';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { WithdrawSheet } from './WithdrawSheet';

interface WithdrawVars {
  amountKopecks: number;
  idempotencyKey: string;
}
interface WithdrawCallbacks {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const withdraw = vi.hoisted(() => ({
  mutate: vi.fn<(vars: WithdrawVars, callbacks?: WithdrawCallbacks) => void>(),
  /** Колбэки уровня мутации — их даёт шторка в `useWithdrawTeacherWallet`. */
  hook: {} as WithdrawCallbacks,
  isPending: false,
}));

vi.mock('@/entities/payment', () => ({
  useWithdrawTeacherWallet: (callbacks: WithdrawCallbacks) => {
    withdraw.hook = callbacks;
    return { mutate: withdraw.mutate, isPending: withdraw.isPending };
  },
}));

/** Как TanStack Query: сначала колбэки мутации (хука), затем — вызова `mutate`. */
function succeed(_vars: WithdrawVars, callbacks?: WithdrawCallbacks) {
  withdraw.hook.onSuccess?.();
  callbacks?.onSuccess?.();
}
function fail(error: unknown) {
  return (_vars: WithdrawVars, callbacks?: WithdrawCallbacks) => {
    withdraw.hook.onError?.(error);
    callbacks?.onError?.(error);
  };
}

function renderSheet(amountKopecks = 670_000) {
  const onClose = vi.fn();
  const bridge = new MockMaxBridge({
    launchParams: null,
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  });
  const haptic = vi.spyOn(bridge, 'haptic').mockImplementation(() => undefined);
  render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <WithdrawSheet open onClose={onClose} balance={{ amountKopecks, currency: 'RUB' }} />
      </ToastProvider>
    </MaxBridgeProvider>,
  );
  expect(screen.getByRole('dialog', { name: 'Вывод средств' })).toBeVisible();
  return { onClose, haptic };
}

const amountInput = () => screen.getByRole('textbox', { name: /Сумма/ });

describe('WithdrawSheet', () => {
  beforeEach(() => {
    withdraw.mutate.mockReset();
    withdraw.isPending = false;
  });

  it('пределы: минимум 100 ₽, максимум — баланс; в поле только цифры, с ошибкой не отправляет', async () => {
    const user = userEvent.setup();
    renderSheet(400_000);
    expect(screen.getByText(/Доступно для вывода: 4\s000\s₽/)).toBeInTheDocument();
    expect(screen.getByText(/От 100\s₽ до 4\s000\s₽/)).toBeInTheDocument();
    expect(screen.getByText('Демо-режим')).toBeInTheDocument();
    expect(
      screen.getByText('Деньги списываются с баланса сразу, реального перевода нет.'),
    ).toBeInTheDocument();

    // Пустое поле: ошибка только после попытки отправить.
    await user.click(screen.getByRole('button', { name: 'Вывести' }));
    expect(screen.getByText('Введите сумму в рублях, без копеек')).toBeInTheDocument();

    await user.type(amountInput(), '5a0');
    expect(amountInput()).toHaveValue('50');
    expect(screen.getByText(/Минимальная сумма — 100\s₽/)).toBeInTheDocument();

    await user.clear(amountInput());
    await user.type(amountInput(), '4500');
    expect(screen.getByText(/Больше, чем на балансе: доступно 4\s000\s₽/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Вывести' }));
    expect(withdraw.mutate).not.toHaveBeenCalled();

    // Быстрые суммы больше баланса недоступны; «Всё» — весь баланс.
    const presets = within(screen.getByRole('group', { name: 'Быстрый выбор суммы' }));
    expect(presets.getByRole('button', { name: /^3\s000\s₽$/ })).toBeEnabled();
    expect(presets.getByRole('button', { name: /^5\s000\s₽$/ })).toBeDisabled();
    const all = presets.getByRole('button', { name: /^Всё — 4\s000\s₽$/ });
    await user.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(amountInput()).toHaveValue('4000');
    expect(screen.getByRole('button', { name: /^Вывести 4\s000\s₽$/ })).toBeInTheDocument();
  });

  it('повтор после ошибки — тот же Idempotency-Key; успех → тост, отклик и закрытие', async () => {
    const user = userEvent.setup();
    const { onClose, haptic } = renderSheet();

    await user.click(screen.getByRole('button', { name: /^3\s000\s₽$/ }));
    withdraw.mutate.mockImplementationOnce(
      fail(
        new ApiClientError({ status: 422, code: 'BUSINESS_RULE', message: 'Недостаточно средств' }),
      ),
    );
    await user.click(screen.getByRole('button', { name: /^Вывести 3\s000\s₽$/ }));
    const first = withdraw.mutate.mock.calls[0]![0];
    expect(first.amountKopecks).toBe(300_000);
    expect(first.idempotencyKey).toBeTruthy();
    expect(await screen.findByText('Недостаточно средств')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Повторный тап по той же быстрой сумме — та же попытка, ключ не меняется.
    await user.click(screen.getByRole('button', { name: /^3\s000\s₽$/ }));
    withdraw.mutate.mockImplementationOnce(succeed);
    await user.click(screen.getByRole('button', { name: /^Вывести 3\s000\s₽$/ }));
    expect(withdraw.mutate.mock.calls[1]![0].idempotencyKey).toBe(first.idempotencyKey);

    expect(await screen.findByText('Вывод оформлен (демо-режим)')).toBeInTheDocument();
    expect(haptic).toHaveBeenCalledWith('success');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('новая сумма после ошибки — новая попытка с новым ключом', async () => {
    const user = userEvent.setup();
    renderSheet();
    withdraw.mutate.mockImplementation(fail(new Error('сеть')));

    await user.type(amountInput(), '1500');
    await user.click(screen.getByRole('button', { name: /^Вывести 1\s500\s₽$/ }));
    await user.clear(amountInput());
    await user.type(amountInput(), '2000');
    await user.click(screen.getByRole('button', { name: /^Вывести 2\s000\s₽$/ }));

    const [first, second] = withdraw.mutate.mock.calls.map(([vars]) => vars);
    expect(second!.amountKopecks).toBe(200_000);
    expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
  });

  it('пока запрос в полёте, шторку не закрыть: ни Escape, ни фон, ни кнопка «Закрыть»', async () => {
    const user = userEvent.setup();
    withdraw.isPending = true;
    const { onClose } = renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Вывод средств' });
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.ui-sheet__backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Вывести/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
