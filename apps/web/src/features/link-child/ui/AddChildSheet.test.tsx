import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { MaxBridgeProvider } from '@/shared/max';
import { MockMaxBridge } from '@/shared/max/mock-bridge';
import { AddChildSheet } from './AddChildSheet';

const INVITE = {
  token: 'invite-token-0123456789',
  url: 'http://localhost/invite/invite-token-0123456789',
  expiresAt: '2026-09-30T10:00:00.000Z',
};

const mocks = vi.hoisted(() => ({ create: vi.fn(), link: vi.fn() }));

vi.mock('@/entities/student', async () => {
  const { useState } = await import('react');
  return {
    // Мутация приглашения: после mutate() в data появляется ссылка.
    useCreateChildInvite: () => {
      const [data, setData] = useState<typeof INVITE | undefined>(undefined);
      return {
        data,
        error: null,
        isError: false,
        isPending: false,
        mutate: () => {
          mocks.create();
          setData(INVITE);
        },
      };
    },
    useLinkChild: () => ({
      mutate: mocks.link,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});

function renderSheet(onClose = vi.fn()) {
  const bridge = new MockMaxBridge({
    launchParams: null,
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  });
  render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <AddChildSheet open onClose={onClose} />
      </ToastProvider>
    </MaxBridgeProvider>,
  );
  return { onClose };
}

describe('AddChildSheet', () => {
  const originalShare = navigator.share;
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.link.mockReset();
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
  });

  it('два способа: ссылка-приглашение и код; ссылка копируется, если «Поделиться» нет', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'Добавить ребёнка' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Пригласить по ссылке' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ввести код' })).toBeInTheDocument();
    expect(
      screen.getByText('Отправь ссылку ребёнку в MAX — он откроет её и подтвердит'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Ссылка-приглашение' })).toHaveValue(INVITE.url);

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    expect(writeText).toHaveBeenCalledWith(INVITE.url);
    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
  });

  it('есть системное «Поделиться» — отправляет ссылку через него', async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderSheet();

    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    await user.click(screen.getByRole('button', { name: 'Поделиться' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: INVITE.url }));
  });
});
