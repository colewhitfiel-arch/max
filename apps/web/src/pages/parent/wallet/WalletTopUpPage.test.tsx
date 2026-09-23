import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { WalletTopUpPage } from './ui/WalletTopUpPage';

interface TopUpVars {
  amountKopecks: number;
  idempotencyKey: string;
}
interface TopUpCallbacks {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const topUp = vi.hoisted(() => ({
  mutate: vi.fn<(vars: TopUpVars, callbacks: TopUpCallbacks) => void>(),
}));

vi.mock('@/entities/payment', () => ({
  useWallet: () => ({
    data: { balance: { amountKopecks: 670_000, currency: 'RUB' } },
    error: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTopUpWallet: () => ({ mutate: topUp.mutate, isPending: false }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderWallet(
  entries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = [
    '/parent',
    { pathname: '/parent/wallet', state: { fromApp: true } },
  ],
) {
  const bridge = new MockMaxBridge({
    launchParams: null,
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  });
  return render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <MemoryRouter initialEntries={entries} initialIndex={(entries?.length ?? 1) - 1}>
          <Routes>
            <Route path="/parent" element={<p>главная</p>} />
            <Route path="/parent/wallet" element={<WalletTopUpPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </MaxBridgeProvider>,
  );
}

const amountInput = () => screen.getByRole('textbox', { name: /Сумма/ });

describe('WalletTopUpPage', () => {
  beforeEach(() => topUp.mutate.mockReset());

  it('показывает баланс, проверяет пределы 100 ₽ … 100 000 ₽ и оставляет только цифры', async () => {
    const user = userEvent.setup();
    renderWallet();
    expect(screen.getByRole('heading', { level: 1, name: 'Пополнение баланса' })).toBeVisible();
    expect(screen.getByText(/6\s700\s₽/)).toBeInTheDocument();
    expect(screen.getByText('На сколько хотите пополнить?')).toBeInTheDocument();

    await user.type(amountInput(), '5a0');
    expect(amountInput()).toHaveValue('50');
    expect(screen.getByText(/Минимальная сумма — 100\s₽/)).toBeInTheDocument();

    await user.clear(amountInput());
    await user.type(amountInput(), '150000');
    expect(screen.getByText(/Максимальная сумма — 100\s000\s₽/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Пополнить' }));
    expect(topUp.mutate).not.toHaveBeenCalled();
  });

  it('быстрый выбор → «Пополнить» с Idempotency-Key; повтор после ошибки — тот же ключ', async () => {
    const user = userEvent.setup();
    renderWallet();

    const preset = screen.getByRole('button', { name: /^3\s000\s₽$/ });
    await user.click(preset);
    expect(preset).toHaveAttribute('aria-pressed', 'true');
    expect(amountInput()).toHaveValue('3000');

    topUp.mutate.mockImplementationOnce((_vars, callbacks) =>
      callbacks.onError?.(new Error('сеть')),
    );
    await user.click(screen.getByRole('button', { name: /^Пополнить на 3\s000\s₽$/ }));
    const first = topUp.mutate.mock.calls[0]![0];
    expect(first.amountKopecks).toBe(300_000);
    expect(first.idempotencyKey).toBeTruthy();

    topUp.mutate.mockImplementationOnce((_vars, callbacks) => callbacks.onSuccess?.());
    await user.click(screen.getByRole('button', { name: /^Пополнить на 3\s000\s₽$/ }));
    expect(topUp.mutate.mock.calls[1]![0].idempotencyKey).toBe(first.idempotencyKey);

    expect(await screen.findByText('Баланс пополнен (демо-режим)')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/parent$/);
  });

  it('открыт не из приложения (вход через /auth с replace) — после пополнения на главную', async () => {
    // Одна запись в истории, но key уже не «default»: шаг назад увёл бы из приложения.
    const user = userEvent.setup();
    renderWallet(['/parent/wallet']);
    topUp.mutate.mockImplementationOnce((_vars, callbacks) => callbacks.onSuccess?.());

    await user.click(screen.getByRole('button', { name: /^3\s000\s₽$/ }));
    await user.click(screen.getByRole('button', { name: /^Пополнить на 3\s000\s₽$/ }));

    expect(await screen.findByText('главная')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/parent$/);
  });
});
