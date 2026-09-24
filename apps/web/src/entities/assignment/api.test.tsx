/**
 * `useSubmitAssignment`: один Idempotency-Key на попытку — повтор после сбоя и двойной клик с тем
 * же ответом идут с тем же ключом; после успеха или с другим ответом — новый ключ.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSubmitAssignment } from './api';

const server = vi.hoisted(() => ({
  submit: vi.fn<(args: { headers: Record<string, string> }) => Promise<unknown>>(),
}));

vi.mock('@/shared/api/client', () => ({
  api: {
    assignments: {
      submitAssignment: (args: { headers: Record<string, string> }) => server.submit(args),
    },
  },
  call: (promise: Promise<unknown>) => promise,
  newRequestId: () => crypto.randomUUID(),
}));

const ASSIGNMENT = '0190a000-0000-7000-8000-000000000031';
const key = (call: number) => server.submit.mock.calls[call]![0].headers['idempotency-key'];

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSubmitAssignment(ASSIGNMENT), { wrapper }).result;
}

describe('useSubmitAssignment', () => {
  it('ретрай и двойной клик — тот же ключ; новый ответ и успех — новый', async () => {
    server.submit.mockReset();
    server.submit.mockRejectedValueOnce(new Error('network'));
    server.submit.mockResolvedValue({ status: 'SUBMITTED' });
    const result = setup();

    await act(async () => {
      await result.current.mutateAsync({ text: 'Ответ' }).catch(() => undefined);
    });
    // Повтор того же ответа после сбоя и «двойной клик».
    await act(async () => {
      await Promise.all([
        result.current.mutateAsync({ text: 'Ответ' }),
        result.current.mutateAsync({ text: 'Ответ' }),
      ]);
    });
    expect(key(1)).toBe(key(0));
    expect(key(2)).toBe(key(0));

    // После успеха — новая попытка с новым ключом.
    await act(async () => {
      await result.current.mutateAsync({ text: 'Ответ' });
    });
    expect(key(3)).not.toBe(key(0));

    // Другой ответ — другой ключ.
    await act(async () => {
      await result.current.mutateAsync({ text: 'Другой ответ' });
    });
    await waitFor(() => expect(server.submit).toHaveBeenCalledTimes(5));
    expect(key(4)).not.toBe(key(3));
  });
});
