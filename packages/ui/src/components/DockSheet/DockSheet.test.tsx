import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DockSheet } from './DockSheet';

function Harness({ open = true, onClose }: { open?: boolean; onClose: () => void }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef}>
        <button type="button">календарь</button>
      </div>
      <p>над панелью</p>
      <DockSheet
        open={open}
        onClose={onClose}
        anchorRef={anchorRef}
        tab="22.09.2026"
        aside={<span>занятия дня</span>}
      >
        <button type="button">день</button>
      </DockSheet>
    </>
  );
}

describe('DockSheet', () => {
  it('немодальный диалог с датой во вкладке, основной и узкой карточкой', () => {
    render(<Harness onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '22.09.2026' });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(dialog).toHaveFocus();
    expect(screen.getByText('занятия дня')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'день' })).toBeInTheDocument();
  });

  it('закрывается тапом мимо и Escape, но не тапом по панели или якорю', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'день' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'календарь' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText('над панелью'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('закрытая панель ничего не рендерит', () => {
    render(<Harness open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
