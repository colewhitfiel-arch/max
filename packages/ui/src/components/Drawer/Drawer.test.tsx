import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('модальная боковая панель с заголовком, закрывается Escape и кнопкой', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Уведомления">
        <button type="button">первое</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Уведомления' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('ui-drawer__dialog');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('закрытая панель ничего не рендерит', () => {
    render(
      <Drawer open={false} onClose={vi.fn()} title="Уведомления">
        текст
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('side="left" — панель слева; по умолчанию справа', () => {
    const { rerender } = render(
      <Drawer open onClose={vi.fn()} title="История чатов" side="left">
        текст
      </Drawer>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'left');
    rerender(
      <Drawer open onClose={vi.fn()} title="Уведомления">
        текст
      </Drawer>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'right');
  });
});
