import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('не рендерится при open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Скрыто">
        Текст
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открытие: role=dialog, aria-modal, имя из title, фокус внутри', () => {
    render(
      <Modal open onClose={() => {}} title="Подтверждение">
        <button type="button">Внутри</button>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Подтверждение');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Escape → onClose', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Окно">
        <button type="button">Ок</button>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('клик по фону и по кнопке «Закрыть» → onClose', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose} title="Окно">
        Текст
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const backdrop = document.body.querySelector('.ui-modal__backdrop');
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(container).toBeEmptyDOMElement();
  });

  it('Tab зацикливается внутри диалога', async () => {
    render(
      <Modal open onClose={() => {}} title="Окно" showClose={false}>
        <button type="button">Первая</button>
        <button type="button">Вторая</button>
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'Первая' });
    const second = screen.getByRole('button', { name: 'Вторая' });
    expect(first).toHaveFocus();
    await userEvent.tab();
    expect(second).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(second).toHaveFocus();
  });

  it('closeLabel переопределяет имя кнопки закрытия (i18n)', () => {
    render(
      <Modal open onClose={() => {}} title="Window" closeLabel="Close">
        Text
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
