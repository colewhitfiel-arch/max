import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastOptions } from './ToastProvider';

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      Показать
    </button>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('подписи региона и крестика переопределяются (i18n)', () => {
    render(
      <ToastProvider regionLabel="Notifications" closeLabel="Close">
        <Trigger options={{ title: 'Saved' }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Saved');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('автозакрытие на паузе, пока тост под курсором или в фокусе', () => {
    render(
      <ToastProvider defaultDuration={1000}>
        <Trigger options={{ title: 'Удалено', action: { label: 'Отменить', onClick: () => {} } }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    const toast = screen.getByText('Удалено').closest('.ui-toast')!;

    act(() => vi.advanceTimersByTime(600));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Удалено')).toBeInTheDocument();

    // Фокус внутри удерживает паузу и после ухода курсора.
    fireEvent.focus(screen.getByRole('button', { name: 'Отменить' }));
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Удалено')).toBeInTheDocument();

    // Фокус ушёл — досчитываются оставшиеся ~400 мс.
    fireEvent.blur(screen.getByRole('button', { name: 'Отменить' }));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('Удалено')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText('Удалено')).not.toBeInTheDocument();
  });
});
