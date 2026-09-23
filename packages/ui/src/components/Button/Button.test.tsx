import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('по умолчанию type="button"', () => {
    render(<Button>Ок</Button>);
    expect(screen.getByRole('button', { name: 'Ок' })).toHaveAttribute('type', 'button');
  });

  it('loading → aria-busy и aria-disabled, фокус остаётся, клик не срабатывает', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Сохранить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Сохранить' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    button.focus();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.keyboard('{Enter} ');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading submit-кнопка не отправляет форму ни кликом, ни Enter в поле', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <input aria-label="Код" />
        <Button type="submit" loading>
          Отправить
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Код' }), 'abc{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disabled вместе с loading — нативно недоступна', () => {
    render(
      <Button loading disabled>
        Сохранить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Сохранить' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('прокидывает data-атрибуты варианта и размера', () => {
    render(
      <Button variant="danger" size="sm">
        Удалить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Удалить' });
    expect(button).toHaveAttribute('data-variant', 'danger');
    expect(button).toHaveAttribute('data-size', 'sm');
  });

  it('variant="link" с underline — текстовая кнопка с data-underline', async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button variant="link" underline onClick={onClick}>
          Скрыть
        </Button>
        <Button variant="link">Подробнее</Button>
      </>,
    );
    const hide = screen.getByRole('button', { name: 'Скрыть' });
    expect(hide).toHaveAttribute('data-variant', 'link');
    expect(hide).toHaveAttribute('data-underline');
    expect(screen.getByRole('button', { name: 'Подробнее' })).not.toHaveAttribute('data-underline');
    await userEvent.click(hide);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
