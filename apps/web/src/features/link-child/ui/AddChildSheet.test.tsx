import { ToastProvider } from '@edu/ui';
import { act, render, screen } from '@testing-library/react';
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

const ALEX = {
  student: {
    id: 'student-alex',
    user: {
      id: 'user-alex',
      firstName: 'Алексей',
      lastName: 'Смирнов',
      nickname: null,
      avatarUrl: null,
    },
    classLabel: '7Б',
  },
  linkStatus: 'ACTIVE',
  school: null,
};
const DASHA = {
  ...ALEX,
  student: {
    ...ALEX.student,
    id: 'student-dasha',
    user: { ...ALEX.student.user, id: 'user-dasha', firstName: 'Даша', lastName: 'Иванова' },
  },
};

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  link: vi.fn(),
  refetchInterval: vi.fn(),
  // Список детей родителя: тест меняет его, как будто ребёнок принял приглашение.
  children: { items: [] as unknown[] },
  listeners: new Set<() => void>(),
}));

function setChildren(items: unknown[]) {
  mocks.children = { items };
  mocks.listeners.forEach((listener) => listener());
}

vi.mock('@/entities/student', async () => {
  const { useState, useSyncExternalStore } = await import('react');
  const NO_CODE_LINKS = { pending: false, links: [] };
  return {
    // Мутация приглашения: после mutate() в data появляется ссылка, reset() её убирает.
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
        reset: () => setData(undefined),
      };
    },
    useChildren: (_enabled: boolean, options?: { refetchInterval?: number | false }) => {
      mocks.refetchInterval(options?.refetchInterval);
      const data = useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => mocks.children,
      );
      return { data };
    },
    useCodeLinkedChildren: () => NO_CODE_LINKS,
    useLinkChild: () => ({
      mutate: mocks.link,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});

function renderSheet(onClose = vi.fn(), onLinked = vi.fn()) {
  const bridge = new MockMaxBridge({
    launchParams: null,
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  });
  render(
    <MaxBridgeProvider bridge={bridge}>
      <ToastProvider>
        <AddChildSheet open onClose={onClose} onLinked={onLinked} />
      </ToastProvider>
    </MaxBridgeProvider>,
  );
  return { onClose, onLinked };
}

describe('AddChildSheet', () => {
  const originalShare = navigator.share;
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.link.mockReset();
    mocks.refetchInterval.mockReset();
    mocks.children = { items: [ALEX] };
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
      screen.getByText('Отправьте ссылку ребёнку в MAX — он откроет её и подтвердит'),
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

  it('пока ссылка на экране, список детей перечитывается; принявший ребёнок выбирается', async () => {
    const user = userEvent.setup();
    const { onClose, onLinked } = renderSheet();
    expect(mocks.refetchInterval).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    expect(mocks.refetchInterval).toHaveBeenLastCalledWith(5_000);
    expect(screen.getByText(/Ждём, когда ребёнок откроет ссылку/)).toBeVisible();

    // Уже привязанный ребёнок — не «принявший»; ожидающая связь — тоже.
    act(() => setChildren([ALEX, { ...DASHA, linkStatus: 'PENDING' }]));
    expect(onLinked).not.toHaveBeenCalled();

    act(() => setChildren([ALEX, DASHA]));
    expect(await screen.findByText('Ребёнок принял приглашение: Даша Иванова')).toBeInTheDocument();
    expect(onLinked).toHaveBeenCalledWith('student-dasha');
    expect(onClose).toHaveBeenCalled();
  });

  it('Clipboard API недоступен — копирует выделением поля со ссылкой', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    renderSheet();

    await user.click(screen.getByRole('button', { name: 'Создать ссылку' }));
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
  });
});
