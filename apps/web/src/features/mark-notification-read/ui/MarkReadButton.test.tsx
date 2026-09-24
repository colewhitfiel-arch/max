/**
 * «Прочитано»: у конкретного уведомления — компактная иконка с доступным именем; внутри
 * кликабельной строки ни клик, ни Enter не открывают саму строку; ошибка — тостом.
 */
import { ListRow, ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NotificationEntity from '@/entities/notification';
import '@/shared/i18n';
import { MarkReadButton } from './MarkReadButton';

const markRead = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/entities/notification', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationEntity>()),
  useMarkRead: () => markRead,
}));

function renderInRow(ui: ReactNode, onRowClick = vi.fn()) {
  render(
    <ToastProvider>
      <ListRow title="Скоро занятие" right={ui} onClick={onRowClick} />
    </ToastProvider>,
  );
  return onRowClick;
}

describe('MarkReadButton', () => {
  beforeEach(() => {
    markRead.mutate.mockReset();
  });

  it('с ids — компактная кнопка-иконка «Прочитано» без текста', () => {
    renderInRow(<MarkReadButton ids={['n1']} />);
    const button = screen.getByRole('button', { name: 'Прочитано' });
    expect(button).not.toHaveTextContent('Прочитано');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('compact={false} — текстовая кнопка; без ids — «Прочитать все»', () => {
    render(
      <ToastProvider>
        <MarkReadButton ids={['n1']} compact={false} />
        <MarkReadButton />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Прочитано' })).toHaveTextContent('Прочитано');
    expect(screen.getByRole('button', { name: 'Прочитать все' })).toHaveTextContent(
      'Прочитать все',
    );
  });

  it('клик и Enter по кнопке отмечают, но не открывают строку', async () => {
    const user = userEvent.setup();
    const onRowClick = renderInRow(<MarkReadButton ids={['n1']} />);
    const button = screen.getByRole('button', { name: 'Прочитано' });

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');

    expect(markRead.mutate).toHaveBeenCalledTimes(2);
    expect(markRead.mutate).toHaveBeenCalledWith(['n1'], expect.anything());
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('ошибка запроса — тост с текстом ошибки', async () => {
    markRead.mutate.mockImplementation(
      (_ids: unknown, options?: { onError?: (error: unknown) => void }) =>
        options?.onError?.(new Error('Сеть недоступна')),
    );
    const user = userEvent.setup();
    renderInRow(<MarkReadButton ids={['n1']} />);
    await user.click(screen.getByRole('button', { name: 'Прочитано' }));
    expect(await screen.findByText('Сеть недоступна')).toBeInTheDocument();
  });
});
